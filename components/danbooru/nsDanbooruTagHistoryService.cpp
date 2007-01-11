/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Communicator client code.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Joe Hewitt <hewitt@netscape.com> (Original Author)
 *   Gordon Tran <buffered@gmail.com> (Shameless mangler of the original code)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

#include "nsDanbooruTagHistoryService.h"

#include "nsIServiceManager.h"
#include "nsIObserverService.h"
#include "nsICategoryManager.h"
#include "nsIDirectoryService.h"
#include "nsDirectoryServiceDefs.h"
#include "nsAppDirectoryServiceDefs.h"

#include "nsAutoCompleteArrayResult.h"

#include "nsCRT.h"
#include "nsString.h"
#include "nsUnicharUtils.h"
#include "nsReadableUtils.h"

// GetResolvedURI
#include "nsIXPConnect.h"
#include "nsIScriptSecurityManager.h"
#include "nsIPrincipal.h"
#include "nsIURL.h"
// Update/Process
#include "nsNetUtil.h"
#include "nsIDOMEventTarget.h"
#include "nsIDOMDocument.h"
#include "nsIDOMElement.h"
#include "nsIDOM3Node.h"
#include "nsIDOMNodeList.h"
#include "nsIDOMEventTarget.h"

#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIPrefBranch2.h"
#include "nsVoidArray.h"
#include "nsCOMArray.h"
#include "mozIStorageService.h"
#include "mozStorageCID.h"

#define PREF_FORMFILL_BRANCH "extensions.danbooruUp.autocomplete."
#define PREF_FORMFILL_ENABLE "enabled"

static const char *kTagHistoryFileName = "danbooruhistory.sqlite";

static const char *kTagTableName = "tags";

#define kApiZeroCount "include_zero_posts=1"

#define kTagHistorySchema "id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, value INTEGER NOT NULL DEFAULT 0"
// temporary table for cleanup join
#define kCreateTempTagTable "CREATE TEMPORARY TABLE tagselect (id INTEGER, name TEXT, value INTEGER NOT NULL DEFAULT 0)"
#define kCreateTempTagIndex "CREATE INDEX tagselect_idx_id ON tagselect (id)"
#define kTempTagInsert "INSERT OR IGNORE INTO tagselect (id, name) VALUES (?1, ?2)"
#define kDropTempTagTable "DROP TABLE tagselect"
// and the cleanup join
#define kTagClean "DELETE FROM tags WHERE id IN (SELECT t.id FROM tags t LEFT OUTER JOIN tagselect s ON t.id=s.id WHERE s.id IS NULL)"
#define kTagInsert "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)"
#define kTagIncrement "UPDATE tags SET value=value+1 WHERE name=?1"
#define kTagSearch "SELECT name FROM tags WHERE name LIKE ?1 ORDER BY value DESC, name ASC"
#define kTagSearchCount "SELECT COUNT(*) FROM tags WHERE name LIKE ?1 ORDER BY value DESC, name ASC"
#define kTagExists "SELECT NULL FROM tags WHERE name=?1"
#define kTagRemoveByID "DELETE FROM tags WHERE id=?1"
#define kRemoveAll "TRUNCATE TABLE tags"
#define kMaxID "SELECT max(id) FROM tags"
#define kRowCount "SELECT count() FROM tags"

NS_INTERFACE_MAP_BEGIN(nsDanbooruTagHistoryService)
  NS_INTERFACE_MAP_ENTRY(nsIDanbooruTagHistoryService)
  NS_INTERFACE_MAP_ENTRY(nsIDOMEventListener)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIDanbooruTagHistoryService)
NS_INTERFACE_MAP_END_THREADSAFE

NS_IMPL_THREADSAFE_ADDREF(nsDanbooruTagHistoryService)
NS_IMPL_THREADSAFE_RELEASE(nsDanbooruTagHistoryService)

#ifdef DANBOORUUP_TESTING
PRBool nsDanbooruTagHistoryService::gTagHistoryEnabled = PR_TRUE;
PRBool nsDanbooruTagHistoryService::gPrefsInitialized = PR_TRUE;
#else
PRBool nsDanbooruTagHistoryService::gTagHistoryEnabled = PR_FALSE;
PRBool nsDanbooruTagHistoryService::gPrefsInitialized = PR_FALSE;
#endif

nsDanbooruTagHistoryService::nsDanbooruTagHistoryService() :
  mRequest(nsnull),
  mDB(nsnull)
{
}

nsDanbooruTagHistoryService::~nsDanbooruTagHistoryService()
{
  CloseDatabase();
}

nsresult
nsDanbooruTagHistoryService::Init()
{
  gTagHistory = this;
  //nsCOMPtr<nsIObserverService> service = do_GetService("@mozilla.org/observer-service;1");
  //if (service)
  //  service->AddObserver(this, NS_FORMSUBMIT_SUBJECT, PR_TRUE);

  return NS_OK;
}

nsDanbooruTagHistoryService *nsDanbooruTagHistoryService::gTagHistory = nsnull;

nsDanbooruTagHistoryService *
nsDanbooruTagHistoryService::GetInstance()
{
	if (gTagHistory) {
		NS_ADDREF(gTagHistory);
		return gTagHistory;
	}

	gTagHistory = new nsDanbooruTagHistoryService();
	if (gTagHistory) {
		NS_ADDREF(gTagHistory);  // addref for the global
		if (NS_FAILED(gTagHistory->Init())) {
			NS_RELEASE(gTagHistory);
		}
	}
	return gTagHistory;
}


void
nsDanbooruTagHistoryService::ReleaseInstance()
{
  NS_IF_RELEASE(gTagHistory);
}

/* static */ PRBool
nsDanbooruTagHistoryService::TagHistoryEnabled()
{
  if (!gPrefsInitialized) {
    nsCOMPtr<nsIPrefService> prefService = do_GetService(NS_PREFSERVICE_CONTRACTID);

    prefService->GetBranch(PREF_FORMFILL_BRANCH,
                           getter_AddRefs(gTagHistory->mPrefBranch));
    gTagHistory->mPrefBranch->GetBoolPref(PREF_FORMFILL_ENABLE,
                                           &gTagHistoryEnabled);

    nsCOMPtr<nsIPrefBranch2> branchInternal =
      do_QueryInterface(gTagHistory->mPrefBranch);
    branchInternal->AddObserver(PREF_FORMFILL_ENABLE, gTagHistory, PR_TRUE);

    gPrefsInitialized = PR_TRUE;
  }

  return gTagHistoryEnabled;
}


////////////////////////////////////////////////////////////////////////
//// nsIDanbooruTagHistoryService

/* pilfered from nsSchemaLoader */
static nsresult
GetResolvedURI(const nsAString& aSchemaURI,
		const char* aMethod,
		nsIURI** aURI)
{
  nsresult rv;
  nsCOMPtr<nsIXPCNativeCallContext> cc;
  nsCOMPtr<nsIXPConnect> xpc(do_GetService(nsIXPConnect::GetCID(), &rv));
  if(NS_SUCCEEDED(rv)) {
    rv = xpc->GetCurrentNativeCallContext(getter_AddRefs(cc));
  }

  if (NS_SUCCEEDED(rv) && cc) {
    JSContext* cx;
    rv = cc->GetJSContext(&cx);
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIScriptSecurityManager> secMan(do_GetService(NS_SCRIPTSECURITYMANAGER_CONTRACTID, &rv));
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIURI> baseURI;
    nsCOMPtr<nsIPrincipal> principal;
    rv = secMan->GetSubjectPrincipal(getter_AddRefs(principal));
    if (NS_SUCCEEDED(rv)) {
      principal->GetURI(getter_AddRefs(baseURI));
    }

    rv = NS_NewURI(aURI, aSchemaURI, nsnull, baseURI);
    if (NS_FAILED(rv)) return rv;

    rv = secMan->CheckLoadURIFromScript(cx, *aURI);
    if (NS_FAILED(rv))
    {
      // Security check failed. The above call set a JS exception. The
      // following lines ensure that the exception is propagated.
      cc->SetExceptionWasThrown(PR_TRUE);
      return rv;
    }
  }
  else {
    rv = NS_NewURI(aURI, aSchemaURI, nsnull);
    if (NS_FAILED(rv)) return rv;
  }

  return NS_OK;
}

nsresult
nsDanbooruTagHistoryService::ProcessTagXML(void *document, PRBool aInsert)
{
	NS_ENSURE_ARG(document);

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	nsCOMPtr<nsIDOMNodeList> nodeList;
	PRUint32 index = 0;
	PRUint32 length = 0;

	((nsIDOMElement *)document)->GetChildNodes(getter_AddRefs(nodeList));

	if (nodeList) {
		nodeList->GetLength(&length);
	} else {
		// no tags?
#ifdef DANBOORUUP_TESTING
		fprintf(stderr,"no tags\n", rv);
#endif
		return NS_OK;
	}
#if defined(DANBOORUUP_TESTING) || defined(DEBUG)
{
	fprintf(stderr, "got %d nodes\n", length);
}
#endif

	nsCOMPtr<nsIDOMNode> child;
	//nsDanbooruTagHistoryService *history = nsDanbooruTagHistoryService::GetInstance();
	nsAutoString tagid, tagname;

	if(aInsert) {	// adding new tags
		mDB->BeginTransaction();
		while (index < length) {
			nodeList->Item(index++, getter_AddRefs(child));
			nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
			if (!childElement) {
				continue;
			}

			// left as a string because sqlite will turn it into an int anyway
			childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
			childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
			if (!tagname.IsEmpty()) {
#if defined(DANBOORUUP_TESTING)
{
	NS_NAMED_LITERAL_STRING(a,"inserting ");
	NS_NAMED_LITERAL_STRING(b," - ");
	nsString bob= a + tagid + b + tagname;
	char *z = ToNewCString(bob);
	fprintf(stderr, "%s\n", z);
	nsMemory::Free(z);
}
#endif
				mInsertStmt->BindStringParameter(0, tagid);
				mInsertStmt->BindStringParameter(1, tagname);
				mInsertStmt->Execute();
			}
		}
		mDB->CommitTransaction();
	} else {	// pruning old tags
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kCreateTempTagTable));

		nsCOMPtr<mozIStorageStatement> tempInsertStmt;
		rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTempTagInsert), getter_AddRefs(tempInsertStmt));
		NS_ENSURE_SUCCESS(rv, rv);

		mDB->BeginTransaction();
		while (index < length) {
			nodeList->Item(index++, getter_AddRefs(child));
			nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
			if (!childElement) {
				continue;
			}

			childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
			childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
			if (!tagname.IsEmpty()) {
				tempInsertStmt->BindStringParameter(0, tagid);
				tempInsertStmt->BindStringParameter(1, tagname);
				tempInsertStmt->Execute();
			}
		}
		mDB->CommitTransaction();

		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kCreateTempTagIndex));
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTagClean));
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kDropTempTagTable));
	}

	return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::HandleEvent(nsIDOMEvent* aEvent)
{
	NS_PRECONDITION(mRequest, "no previous tag update request");

	nsCOMPtr<nsIDOMDocument> document;
	nsresult rv = mRequest->GetResponseXML(getter_AddRefs(document));
	if (NS_FAILED(rv)) {
		return rv;
	}

	nsCOMPtr<nsIDOMElement> element;
	document->GetDocumentElement(getter_AddRefs(element));
	if (element) {
#ifdef DANBOORUUP_TESTING
	fprintf(stderr,"processing %s\n", mInserting?"insertion":"removal");
#endif
		ProcessTagXML(element, mInserting);
		rv = NS_OK;
	} else {
		rv = NS_ERROR_CANNOT_CONVERT_DATA;
	}
#ifdef DANBOORUUP_TESTING
	fprintf(stderr,"done %08x\n", rv);
#endif
	return rv;
}

/* used to be the nsISchema load */
NS_IMETHODIMP
nsDanbooruTagHistoryService::UpdateTagListFromURI(const nsAString &aXmlURI, PRBool insert)
{
	if(mRequest) {
		PRInt32 st;
		mRequest->GetReadyState(&st);
#ifdef DANBOORUUP_TESTING
		fprintf(stderr,"previous state %d\n", st);
#endif
		// GetReadyState doesn't return mState -- oops
		if(st != 4)
			return NS_ERROR_NOT_AVAILABLE;
	}

	nsCOMPtr<nsIURI> resolvedURI;
	nsresult rv = GetResolvedURI(aXmlURI, "load", getter_AddRefs(resolvedURI));
	if (NS_FAILED(rv)) {
		return rv;
	}

	nsCOMPtr<nsIURL> url(do_QueryInterface(resolvedURI, &rv));
	if (NS_FAILED(rv))
		return rv;

	mInserting = insert;
	if(!insert) {
		url->SetQuery(NS_LITERAL_CSTRING(kApiZeroCount));
	}

	nsCAutoString spec;
	url->GetSpec(spec);

#ifdef DANBOORUUP_TESTING
	fprintf(stderr,"using %s\n", spec.get());
#endif

	mRequest = do_CreateInstance(NS_XMLHTTPREQUEST_CONTRACTID, &rv);
	if (!mRequest) {
		return rv;
	}

	const nsAString& empty = EmptyString();
	rv = mRequest->OpenRequest(NS_LITERAL_CSTRING("GET"), spec, PR_TRUE, empty, empty);
	if (NS_FAILED(rv)) {
		return rv;
	}

	// Force the mimetype of the returned stream to be xml.
	rv = mRequest->OverrideMimeType(NS_LITERAL_CSTRING("application/xml"));
	if (NS_FAILED(rv)) {
		return rv;
	}

	// keep-alive, more like zombie
	rv = mRequest->SetRequestHeader(NS_LITERAL_CSTRING("Connection"), NS_LITERAL_CSTRING("close"));
	if (NS_FAILED(rv)) {
		return rv;
	}
#ifdef DANBOORUUP_TESTING
	fprintf(stderr,"getting data\n", rv);
#endif

	// async handler
	nsCOMPtr<nsIDOMEventTarget> target(do_QueryInterface(mRequest));
	if (!target) {
		return NS_ERROR_UNEXPECTED;
	}
	rv = target->AddEventListener(NS_LITERAL_STRING("load"), this, PR_FALSE);
	if (NS_FAILED(rv)) {
		return rv;
	}

	rv = mRequest->Send(nsnull);
	if (NS_FAILED(rv)) {
		return rv;
	}

	return rv;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::GetRowCount(PRUint32 *aRowCount)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  PRBool row;
  mRowCountStmt->ExecuteStep(&row);
  if (row)
  {
	  PRInt32 type;
	  mRowCountStmt->GetTypeOfIndex(0, &type);
	  if (type == mozIStorageValueArray::VALUE_TYPE_NULL)
		  *aRowCount = 0;
	  else
#ifdef DANBOORUUP_1_8_0_STORAGE
		  mRowCountStmt->GetAsInt32(0, (PRInt32 *)aRowCount);
#else
		  mRowCountStmt->GetInt32(0, (PRInt32 *)aRowCount);
#endif
	  mRowCountStmt->Reset();
  } else {
	  return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::GetMaxID(PRUint32 *aRowCount)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  PRBool row;
  mMaxIDStmt->ExecuteStep(&row);
  if (row)
  {
	  PRInt32 type;
	  mMaxIDStmt->GetTypeOfIndex(0, &type);
	  if (type == mozIStorageValueArray::VALUE_TYPE_NULL)
		  *aRowCount = -1;
	  else
#ifdef DANBOORUUP_1_8_0_STORAGE
		  mMaxIDStmt->GetAsInt32(0, (PRInt32 *)aRowCount);
#else
		  mMaxIDStmt->GetInt32(0, (PRInt32 *)aRowCount);
#endif
	  mMaxIDStmt->Reset();
  } else {
	  return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::GetEntryAt(PRUint32 aIndex, nsAString &aName, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::GetNameAt(PRUint32 aIndex, nsAString &aName)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::GetValueAt(PRUint32 aIndex, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::AddEntry(const nsAString &aName, const nsAString &aID, const PRInt32 aValue)
{
  if (!TagHistoryEnabled())
    return NS_OK;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  mInsertStmt->BindStringParameter(0, aID);
  mInsertStmt->BindStringParameter(1, aName);
  return mInsertStmt->Execute();

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::AddNameEntry(const nsAString &aName, const nsAString &aID )
{
  if (!TagHistoryEnabled())
    return NS_OK;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  mInsertStmt->BindStringParameter(0, aID);
  mInsertStmt->BindStringParameter(1, aName);
  return mInsertStmt->Execute();

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::RemoveEntryAt(PRUint32 index)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::EntryExists(const nsAString &aName, const PRInt32 aValue, PRBool *_retval)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::NameExists(const nsAString &aName, PRBool *_retval)
{
  mExistsStmt->BindStringParameter(0, aName);
  *_retval = PR_FALSE;
  nsresult rv = mExistsStmt->ExecuteStep(_retval);
  NS_ENSURE_SUCCESS(rv, rv);

  mExistsStmt->Reset();

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::RemoveEntriesForName(const nsAString &aName)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::RemoveAllEntries()
{
  // or we could just drop the database
  //mDB->BeginTransaction();
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kRemoveAll));
  //mDB->CommitTransaction();

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistoryService::IncrementValueForName(const nsAString &aName, PRBool *retval)
{
	if(aName.IsEmpty())
		return NS_ERROR_INVALID_ARG;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	PRBool exists;
	NameExists(aName, &exists);
	if(exists) {
		mIncrementStmt->BindStringParameter(0, aName);
		mIncrementStmt->Execute();
		*retval = PR_TRUE;
	} else {
		// defer adding tag until we can get an ID
		*retval = PR_FALSE;
	}
	return NS_OK;
}

////////////////////////////////////////////////////////////////////////
//// nsIObserver

NS_IMETHODIMP
nsDanbooruTagHistoryService::Observe(nsISupports *aSubject, const char *aTopic, const PRUnichar *aData)
{
  if (!strcmp(aTopic, NS_PREFBRANCH_PREFCHANGE_TOPIC_ID)) {
    //mPrefBranch->GetBoolPref(PREF_FORMFILL_ENABLE, &gTagHistoryEnabled);
  }

  return NS_OK;
}

////////////////////////////////////////////////////////////////////////
//// nsIFormSubmitObserver
#if 0
NS_IMETHODIMP
nsDanbooruTagHistoryService::Notify(nsIContent* aFormNode, nsIDOMWindowInternal* aWindow, nsIURI* aActionURL, PRBool* aCancelSubmit)
{
  if (!FormHistoryEnabled())
    return NS_OK;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDOMHTMLFormElement> formElt = do_QueryInterface(aFormNode);
  NS_ENSURE_TRUE(formElt, NS_ERROR_FAILURE);

  nsCOMPtr<nsIDOMHTMLCollection> elts;
  formElt->GetElements(getter_AddRefs(elts));

  const char *textString = "text";

  PRUint32 length;
  elts->GetLength(&length);
  for (PRUint32 i = 0; i < length; ++i) {
    nsCOMPtr<nsIDOMNode> node;
    elts->Item(i, getter_AddRefs(node));
    nsCOMPtr<nsIDOMHTMLInputElement> inputElt = do_QueryInterface(node);
    if (inputElt) {
      // Filter only inputs that are of type "text"
      nsAutoString type;
      inputElt->GetType(type);
      if (type.EqualsIgnoreCase(textString)) {
        // If this input has a name/id and value, add it to the database
        nsAutoString value;
        inputElt->GetValue(value);
        if (!value.IsEmpty()) {
          nsAutoString name;
          inputElt->GetName(name);
          if (name.IsEmpty())
            inputElt->GetId(name);

          if (!name.IsEmpty())
            AppendRow(name, value, nsnull);
        }
      }
    }
  }

  return NS_OK;
}
#endif
////////////////////////////////////////////////////////////////////////
//// Database I/O

nsresult
nsDanbooruTagHistoryService::OpenDatabase()
{
  if (mDB)
    return NS_OK;

  nsCOMPtr<mozIStorageService> storage = do_GetService(MOZ_STORAGE_SERVICE_CONTRACTID);

  // Get a handle to the database file
  nsCOMPtr <nsIFile> historyFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(historyFile));
  if(NS_FAILED(rv))
  {
    // probably using xpcshell
    rv = NS_GetSpecialDirectory(NS_OS_CURRENT_WORKING_DIR, getter_AddRefs(historyFile));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  historyFile->Append(NS_ConvertUTF8toUTF16(kTagHistoryFileName));

  //rv = storage->GetProfileStorage("profile", getter_AddRefs(mDB));
  rv = storage->OpenDatabase(historyFile, getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);
  if (mDB == nsnull)
    return NS_ERROR_FAILURE;

  mDB->CreateTable(kTagTableName, kTagHistorySchema);

  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagInsert), getter_AddRefs(mInsertStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagRemoveByID), getter_AddRefs(mRemoveByIDStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagIncrement), getter_AddRefs(mIncrementStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagSearch), getter_AddRefs(mSearchStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagSearchCount), getter_AddRefs(mSearchCountStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagExists), getter_AddRefs(mExistsStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kMaxID), getter_AddRefs(mMaxIDStmt));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kRowCount), getter_AddRefs(mRowCountStmt));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult
nsDanbooruTagHistoryService::CloseDatabase()
{
  // mozStorageConnection destructor takes care of this

  return NS_OK;
}

nsresult
nsDanbooruTagHistoryService::AutoCompleteSearch(const nsAString &aInputName,
                                  nsIAutoCompleteArrayResult *aPrevResult,
                                  nsIAutoCompleteResult **aResult)
{
	if (!TagHistoryEnabled())
		return NS_OK;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	nsCOMPtr<nsIAutoCompleteArrayResult> result;
	// not so great performance-wise to re-search every time a wildcard is present, but the alternative is too much trouble
	if (aPrevResult && (aInputName.FindChar('*') == kNotFound)) {
		result = aPrevResult;

		PRUint32 rowCount;
		result->GetMatchCount(&rowCount);
		for (PRInt32 i = rowCount-1; i >= 0; --i) {
			nsAutoString name;
			result->GetValueAt(i, name);
			if (Compare(Substring(name, 0, aInputName.Length()), aInputName, nsCaseInsensitiveStringComparator()))
				result->RemoveValueAt(i, PR_FALSE);
		}
	} else {
		result = do_CreateInstance(NS_AUTOCOMPLETEARRAYRESULT_CONTRACTID);
		/*nsCOMPtr<nsIComponentManager> compMgr;
		rv = NS_GetComponentManager(getter_AddRefs(compMgr));
		if (NS_FAILED(rv))
			return rv;

		rv = compMgr->CreateInstanceByContractID(NS_AUTOCOMPLETEARRAYRESULT_CONTRACTID, NULL,
				NS_GET_IID(nsIAutoCompleteArrayResult),
				getter_AddRefs(result));
		if (NS_FAILED(rv))
			return rv;*/

		if (result == nsnull) // nande da yo
			return NS_ERROR_FAILURE;

		result->SetSearchString(aInputName);

		PRBool row;
		nsAutoString name, likeInputName;
		likeInputName = aInputName;
		// change * wildcard to SQL % wildcard, escaping the actual %s first
		likeInputName.ReplaceSubstring(NS_LITERAL_STRING("%"), NS_LITERAL_STRING("\\%"));
		likeInputName.ReplaceSubstring(NS_LITERAL_STRING("*"), NS_LITERAL_STRING("%"));
		if(aInputName.FindChar('*') == kNotFound) {
			likeInputName.Append(NS_LITERAL_STRING("%"));
		}
#if defined(DANBOORUUP_TESTING) || defined(DEBUG)
{
	nsAutoString bob;
	bob = aInputName + NS_LITERAL_STRING(" -> ") + likeInputName;
	char *z = ToNewCString(bob);
	fprintf(stderr, "%s\n", z);
	nsMemory::Free(z);
}
#endif

		mSearchStmt->BindStringParameter(0, likeInputName);
		mSearchStmt->ExecuteStep(&row);
		while (row)
		{
#ifdef DANBOORUUP_1_8_0_STORAGE
			mSearchStmt->GetAsString(0, name);
#else
			// schema: tags.name varchar(255)
			name = mSearchStmt->AsSharedWString(0, nsnull);
#endif
			result->AddRow(name);
			mSearchStmt->ExecuteStep(&row);
		}
		mSearchStmt->Reset();

		PRUint32 matchCount;
		result->GetMatchCount(&matchCount);
		if (matchCount > 0) {
			result->SetSearchResult(nsIAutoCompleteResult::RESULT_SUCCESS);
			result->SetDefaultIndex(0);
		} else {
			result->SetSearchResult(nsIAutoCompleteResult::RESULT_NOMATCH);
			result->SetDefaultIndex(-1);
		}
	}
	*aResult = result;
	NS_IF_ADDREF(*aResult);

	return NS_OK;
}

void
nsDanbooruTagHistoryService::CleanupTagArray(PRUnichar**& aArray, PRUint32& aCount)
{
	for (PRInt32 i = aCount - 1; i >= 0; i--) {
		nsMemory::Free(aArray[i]);
	}
	nsMemory::Free(aArray);
	aArray = NULL;
	aCount = 0;
}

nsresult
nsDanbooruTagHistoryService::SearchTags(const nsAString &aInputName,
					PRUnichar ***aResult,
					PRUint32 *aCount)
{
	NS_ENSURE_ARG(aCount);
	NS_ENSURE_ARG_POINTER(aResult);

	nsresult rv = OpenDatabase();
	NS_ENSURE_SUCCESS(rv, rv);

	PRBool row;
	PRUint32 ct;
	mSearchCountStmt->BindStringParameter(0, aInputName);
	mSearchCountStmt->ExecuteStep(&row);
	ct = (PRUint32)mSearchCountStmt->AsInt32(0);
	mSearchCountStmt->Reset();

	if(ct)
	{
	 	PRUnichar** array = (PRUnichar **)nsMemory::Alloc(ct * sizeof(PRUnichar *));
		if (!array)
			return NS_ERROR_OUT_OF_MEMORY;

		mSearchStmt->BindStringParameter(0, aInputName);
		mSearchStmt->ExecuteStep(&row);
		PRUint32 index = 0;
		nsAutoString name;
		while (row && index < ct)
		{
#ifdef DANBOORUUP_1_8_0_STORAGE
			mSearchStmt->GetAsString(0, name);
#else
			name = mSearchStmt->AsSharedWString(0, nsnull);
#endif
			array[index] = ToNewUnicode(name);
			if (!array[index] || !*(array[index])) {
				CleanupTagArray(array, ct);
				return NS_ERROR_OUT_OF_MEMORY;
			}
			mSearchStmt->ExecuteStep(&row);
			index++;
		}
		*aResult = array;
		*aCount = ct;
	}
	return NS_OK;
}

