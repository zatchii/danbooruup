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

#include "nsDanbooruTagHistory.h"

#include "nsIServiceManager.h"
#include "nsIObserverService.h"
#include "nsICategoryManager.h"
#include "nsIDirectoryService.h"
#include "nsAppDirectoryServiceDefs.h"

#include "nsAutoCompleteArrayResult.h"

#ifdef DANBOORUUP_MORK
#include "nsMorkCID.h"
#include "nsIMdbFactoryFactory.h"
#include "nsQuickSort.h"
#endif

#include "nsCRT.h"
#include "nsString.h"
#include "nsUnicharUtils.h"
#include "nsReadableUtils.h"

// GetResolvedURI 
#include "nsIXPConnect.h"
#include "nsIScriptSecurityManager.h"
#include "nsIPrincipal.h"
// Update/Process
#include "nsIXMLHttpRequest.h"
#include "nsNetUtil.h"
#include "nsIDOMDocument.h"
#include "nsIDOMElement.h"
#include "nsIDOM3Node.h"
#include "nsIDOMNodeList.h"

#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIPrefBranch2.h"
#include "nsVoidArray.h"
#include "nsCOMArray.h"
#include "mozIStorageService.h"
#include "mozStorageCID.h"

#define PREF_FORMFILL_BRANCH "extensions.danbooruUp.autocomplete."
#define PREF_FORMFILL_ENABLE "enabled"

#ifdef DANBOORUUP_MORK
static const char *kTagHistoryFileName = "danbooruhistory.dat";
#else
static const char *kTagHistoryFileName = "danbooruhistory.sdb";

static const char *kTagTableName = "tags";
#define kTagHistorySchema "id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, value INTEGER NOT NULL DEFAULT 0"
#define kTagInsert "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)"
#define kTagIncrement "UPDATE tags SET value=value+1 WHERE name=?1"
#define kTagSearch "SELECT name FROM tags WHERE name LIKE ?1||'%' ORDER BY value desc,name asc"
#define kTagExists "SELECT NULL FROM tags WHERE name=?1"
#define kRemoveAll "DELETE FROM tags"
#endif

NS_INTERFACE_MAP_BEGIN(nsDanbooruTagHistory)
  NS_INTERFACE_MAP_ENTRY(nsIDanbooruTagHistory)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIObserver)
NS_INTERFACE_MAP_END_THREADSAFE

NS_IMPL_THREADSAFE_ADDREF(nsDanbooruTagHistory)
NS_IMPL_THREADSAFE_RELEASE(nsDanbooruTagHistory)

#ifdef DANBOORUUP_MORK
mdb_column nsDanbooruTagHistory::kToken_NameColumn = 0;
mdb_column nsDanbooruTagHistory::kToken_ValueColumn = 0;
#endif

#ifdef DANBOORUUP_TESTING
PRBool nsDanbooruTagHistory::gTagHistoryEnabled = PR_TRUE;
PRBool nsDanbooruTagHistory::gPrefsInitialized = PR_TRUE;
#else
PRBool nsDanbooruTagHistory::gTagHistoryEnabled = PR_FALSE;
PRBool nsDanbooruTagHistory::gPrefsInitialized = PR_FALSE;
#endif

nsDanbooruTagHistory::nsDanbooruTagHistory() :
#ifdef DANBOORUUP_MORK
  mEnv(nsnull),
  mStore(nsnull),
  mTable(nsnull)
#else
  mDB(nsnull)
#endif
{
}

nsDanbooruTagHistory::~nsDanbooruTagHistory()
{
  CloseDatabase();
}

nsresult
nsDanbooruTagHistory::Init()
{
  gTagHistory = this;
  //nsCOMPtr<nsIObserverService> service = do_GetService("@mozilla.org/observer-service;1");
  //if (service)
  //  service->AddObserver(this, NS_FORMSUBMIT_SUBJECT, PR_TRUE);

  return NS_OK;
}

nsDanbooruTagHistory *nsDanbooruTagHistory::gTagHistory = nsnull;

nsDanbooruTagHistory *
nsDanbooruTagHistory::GetInstance()
{
  if (!gTagHistory) {
    gTagHistory = new nsDanbooruTagHistory();
    if (!gTagHistory)
      return nsnull;

    NS_ADDREF(gTagHistory);  // addref for the global

    if (NS_FAILED(gTagHistory->Init())) {
      NS_RELEASE(gTagHistory);

      return nsnull;
    }
  }

  NS_ADDREF(gTagHistory);   // addref for the getter

  return gTagHistory;
}


void
nsDanbooruTagHistory::ReleaseInstance()
{
  NS_IF_RELEASE(gTagHistory);
}

/* static */ PRBool
nsDanbooruTagHistory::TagHistoryEnabled()
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
//// nsIDanbooruTagHistory

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
nsDanbooruTagHistory::ProcessTagXML(void *document)
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
		return NS_OK;
	}

	nsCOMPtr<nsIDOMNode> child;
	//nsDanbooruTagHistory *history = nsDanbooruTagHistory::GetInstance();
	mDB->BeginTransaction();
	while (index < length) {
		nodeList->Item(index++, getter_AddRefs(child));
		nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
		if (!childElement) {
			continue;
		}

		nsAutoString tagname, tagid;

		childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
		childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
		if (!tagname.IsEmpty()) {
			mInsertStmt->BindStringParameter(0, tagid);
			mInsertStmt->BindStringParameter(1, tagname);
			mInsertStmt->Execute();
		}
	}
	mDB->CommitTransaction();

	return NS_OK;
}

/* used to be the nsISchema load */
NS_IMETHODIMP
nsDanbooruTagHistory::UpdateTagListFromURI(const nsAString &aXmlURI)
{
	nsCOMPtr<nsIURI> resolvedURI;
	nsresult rv = GetResolvedURI(aXmlURI, "load", getter_AddRefs(resolvedURI));
	if (NS_FAILED(rv)) {
		return rv;
	}
	nsCAutoString spec;
	resolvedURI->GetSpec(spec);

	nsCOMPtr<nsIXMLHttpRequest> request(do_CreateInstance(NS_XMLHTTPREQUEST_CONTRACTID, &rv));
	if (!request) {
		return rv;
	}

	const nsAString& empty = EmptyString();
	rv = request->OpenRequest(NS_LITERAL_CSTRING("GET"), spec, PR_FALSE, empty, empty);
	if (NS_FAILED(rv)) {
		return rv;
	}

	// Force the mimetype of the returned stream to be xml.
	rv = request->OverrideMimeType(NS_LITERAL_CSTRING("application/xml"));
	if (NS_FAILED(rv)) {
		return rv;
	}

	// keep-alive, more like zombie
	rv = request->SetRequestHeader(NS_LITERAL_CSTRING("Connection"), NS_LITERAL_CSTRING("close"));
	if (NS_FAILED(rv)) {
		return rv;
	}
#ifdef DANBOORUUP_TESTING
	fprintf(stderr,"getting\n", rv);
#endif

	rv = request->Send(nsnull);
	if (NS_FAILED(rv)) {
		return rv;
	}

	nsCOMPtr<nsIDOMDocument> document;
	rv = request->GetResponseXML(getter_AddRefs(document));
	if (NS_FAILED(rv)) {
		return rv;
	}

	nsCOMPtr<nsIDOMElement> element;
	document->GetDocumentElement(getter_AddRefs(element));
	if (element) {
		ProcessTagXML(element);
	}
	else {
		rv = NS_ERROR_CANNOT_CONVERT_DATA;
	}

	return rv;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetRowCount(PRUint32 *aRowCount)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

#ifdef DANBOORUUP_MORK
  mdb_err err = mTable->GetCount(mEnv, aRowCount);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetEntryAt(PRUint32 aIndex, nsAString &aName, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

#ifdef DANBOORUUP_MORK
  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->PosToRow(mEnv, aIndex, getter_AddRefs(row));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  GetRowValue(row, kToken_NameColumn, aName);
  GetRowValue(row, kToken_ValueColumn, aValue);
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetNameAt(PRUint32 aIndex, nsAString &aName)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

#ifdef DANBOORUUP_MORK
  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->PosToRow(mEnv, aIndex, getter_AddRefs(row));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  GetRowValue(row, kToken_NameColumn, aName);
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetValueAt(PRUint32 aIndex, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

#ifdef DANBOORUUP_MORK
  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->PosToRow(mEnv, aIndex, getter_AddRefs(row));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  GetRowValue(row, kToken_ValueColumn, aValue);
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::AddEntry(const nsAString &aName, const nsAString &aID, const PRInt32 aValue)
{
  if (!TagHistoryEnabled())
    return NS_OK;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  mInsertStmt->BindStringParameter(0, aID);
  mInsertStmt->BindStringParameter(1, aName);
  return mInsertStmt->Execute();

#ifdef DANBOORUUP_MORK
  nsCOMPtr<nsIMdbRow> row;
  AppendRow(aName, aID, aValue, getter_AddRefs(row));
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::AddNameEntry(const nsAString &aName, const nsAString &aID )
{
  if (!TagHistoryEnabled())
    return NS_OK;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  mInsertStmt->BindStringParameter(0, aID);
  mInsertStmt->BindStringParameter(1, aName);
  return mInsertStmt->Execute();

#ifdef DANBOORUUP_MORK
  nsCOMPtr<nsIMdbRow> row;
  AppendRow(aName, getter_AddRefs(row));
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::RemoveEntryAt(PRUint32 index)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsDanbooruTagHistory::EntryExists(const nsAString &aName, const PRInt32 aValue, PRBool *_retval)
{
#ifndef DANBOORUUP_MORK
  return NS_ERROR_NOT_IMPLEMENTED;
#else
  return EntriesExistInternal(&aName, aValue, _retval);
#endif
}

NS_IMETHODIMP
nsDanbooruTagHistory::NameExists(const nsAString &aName, PRBool *_retval)
{
#ifndef DANBOORUUP_MORK
  mExistsStmt->BindStringParameter(0, aName);
  *_retval = PR_FALSE;
  nsresult rv = mExistsStmt->ExecuteStep(_retval);
  NS_ENSURE_SUCCESS(rv, rv);

  mExistsStmt->Reset();

  return NS_OK;
#else
  return EntriesExistInternal(&aName, nsnull, _retval);
#endif
}

NS_IMETHODIMP
nsDanbooruTagHistory::RemoveEntriesForName(const nsAString &aName)
{
#ifndef DANBOORUUP_MORK
  return NS_ERROR_NOT_IMPLEMENTED;
#else
  return RemoveEntriesInternal(&aName);
#endif
}

NS_IMETHODIMP
nsDanbooruTagHistory::RemoveAllEntries()
{
#ifndef DANBOORUUP_MORK
  // or we could just drop the database
  mDB->BeginTransaction();
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kRemoveAll));
  mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("VACUUM"));
  mDB->CommitTransaction();

  return NS_OK;
#else
  nsresult rv = RemoveEntriesInternal(nsnull);

  rv |= Flush();

  return rv;
#endif
}

NS_IMETHODIMP
nsDanbooruTagHistory::IncrementValueForName(const nsAString &aName, PRBool *retval)
{
	if(aName.IsEmpty())
		return NS_ERROR_INVALID_ARG;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

#ifndef DANBOORUUP_MORK
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
#else
	mdb_err err;
	mdb_count count;
	nsAutoString name;
	PRInt32 value;
	err = mTable->GetCount(mEnv, &count);
	if (err != 0) return NS_ERROR_FAILURE;

	// hurry up with that sqlite
	for (mdb_pos pos = count - 1; pos >= 0; --pos) {
		nsCOMPtr<nsIMdbRow> row;
		err = mTable->PosToRow(mEnv, pos, getter_AddRefs(row));
		NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);
		if (err != 0)
			break;
		if (! row)
			continue;

		GetRowValue(row, kToken_NameColumn, name);
		if (Compare(name, aName, nsCaseInsensitiveStringComparator()) == 0) {
			GetRowValue(row, kToken_ValueColumn, &value);
			SetRowValue(row, kToken_ValueColumn, value+1);
			break;
		}
	}
	// tag not in db, add it with one use
	if (pos == -1) {
		AddEntry(aName, 1);
	}

	return NS_OK;
#endif
}

////////////////////////////////////////////////////////////////////////
//// nsIObserver

NS_IMETHODIMP
nsDanbooruTagHistory::Observe(nsISupports *aSubject, const char *aTopic, const PRUnichar *aData)
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
nsDanbooruTagHistory::Notify(nsIContent* aFormNode, nsIDOMWindowInternal* aWindow, nsIURI* aActionURL, PRBool* aCancelSubmit)
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

#ifdef DANBOORUUP_MORK
class DanbooruErrorHook : public nsIMdbErrorHook
{
public:
  NS_DECL_ISUPPORTS

  // nsIMdbErrorHook
  NS_IMETHOD OnErrorString(nsIMdbEnv* ev, const char* inAscii);
  NS_IMETHOD OnErrorYarn(nsIMdbEnv* ev, const mdbYarn* inYarn);
  NS_IMETHOD OnWarningString(nsIMdbEnv* ev, const char* inAscii);
  NS_IMETHOD OnWarningYarn(nsIMdbEnv* ev, const mdbYarn* inYarn);
  NS_IMETHOD OnAbortHintString(nsIMdbEnv* ev, const char* inAscii);
  NS_IMETHOD OnAbortHintYarn(nsIMdbEnv* ev, const mdbYarn* inYarn);
};

// nsIMdbErrorHook has no IID!
NS_IMPL_ISUPPORTS0(DanbooruErrorHook)

NS_IMETHODIMP
DanbooruErrorHook::OnErrorString(nsIMdbEnv *ev, const char *inAscii)
{
  printf("mork error: %s\n", inAscii);
  return NS_OK;
}

NS_IMETHODIMP
DanbooruErrorHook::OnErrorYarn(nsIMdbEnv *ev, const mdbYarn* inYarn)
{
  printf("mork error yarn: %p\n", (void*)inYarn);
  return NS_OK;
}

NS_IMETHODIMP
DanbooruErrorHook::OnWarningString(nsIMdbEnv *ev, const char *inAscii)
{
  printf("mork warning: %s\n", inAscii);
  return NS_OK;
}

NS_IMETHODIMP
DanbooruErrorHook::OnWarningYarn(nsIMdbEnv *ev, const mdbYarn *inYarn)
{
  printf("mork warning yarn: %p\n", (void*)inYarn);
  return NS_OK;
}

NS_IMETHODIMP
DanbooruErrorHook::OnAbortHintString(nsIMdbEnv *ev, const char *inAscii)
{
  printf("mork abort: %s\n", inAscii);
  return NS_OK;
}

NS_IMETHODIMP
DanbooruErrorHook::OnAbortHintYarn(nsIMdbEnv *ev, const mdbYarn *inYarn)
{
  printf("mork abort yarn: %p\n", (void*)inYarn);
  return NS_OK;
}
#endif

nsresult
nsDanbooruTagHistory::OpenDatabase()
{
#ifndef DANBOORUUP_MORK
  if (mDB)
    return NS_OK;

  nsCOMPtr<mozIStorageService> storage = do_GetService(MOZ_STORAGE_SERVICE_CONTRACTID);

  // Get a handle to the database file
  nsCOMPtr <nsIFile> historyFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(historyFile));
  NS_ENSURE_SUCCESS(rv, rv);
  historyFile->Append(NS_ConvertUTF8toUCS2(kTagHistoryFileName));
  
  //rv = storage->GetProfileStorage("profile", getter_AddRefs(mDB));
  rv = storage->OpenDatabase(historyFile, getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);
  if (mDB == nsnull)
    return NS_ERROR_FAILURE;

  mDB->CreateTable(kTagTableName, kTagHistorySchema);

  mDB->CreateStatement(NS_LITERAL_CSTRING(kTagInsert), getter_AddRefs(mInsertStmt));
  mDB->CreateStatement(NS_LITERAL_CSTRING(kTagIncrement), getter_AddRefs(mIncrementStmt));
  mDB->CreateStatement(NS_LITERAL_CSTRING(kTagSearch), getter_AddRefs(mSearchStmt));
  mDB->CreateStatement(NS_LITERAL_CSTRING(kTagExists), getter_AddRefs(mExistsStmt));

  return NS_OK;

#else
  if (mStore)
    return NS_OK;

  // Get a handle to the database file
  nsCOMPtr <nsIFile> historyFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(historyFile));
#ifndef DANBOORUUP_TESTING
  NS_ENSURE_SUCCESS(rv, rv);
#else
  if(NS_FAILED(rv)) {
	rv = NS_GetSpecialDirectory("CurWorkD", getter_AddRefs(historyFile));
	NS_ENSURE_SUCCESS(rv, rv);
  }
#endif
  historyFile->Append(NS_ConvertUTF8toUCS2(kTagHistoryFileName));

  // Get an Mdb Factory
  static NS_DEFINE_CID(kMorkCID, NS_MORK_CID);
  nsCOMPtr<nsIMdbFactoryFactory> mdbFactory = do_CreateInstance(kMorkCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mdbFactory->GetMdbFactory(getter_AddRefs(mMdbFactory));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create the Mdb environment
  mdb_err err = mMdbFactory->MakeEnv(nsnull, &mEnv);
  NS_ASSERTION(err == 0, "ERROR: Unable to create Tab History mdb");
  mEnv->SetAutoClear(PR_TRUE);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);
  mEnv->SetErrorHook(new DanbooruErrorHook());

  nsCAutoString filePath;
  historyFile->GetNativePath(filePath);
  PRBool exists = PR_TRUE;
  historyFile->Exists(&exists);

  if (!exists || NS_FAILED(rv = OpenExistingFile(filePath.get()))) {
    // If the file doesn't exist, or we fail trying to open it,
    // then make sure it is deleted and then create an empty database file
    historyFile->Remove(PR_FALSE);
    rv = CreateNewFile(filePath.get());
  }
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the initial size of the file, needed later for Commit
  historyFile->GetFileSize(&mFileSizeOnDisk);

  return NS_OK;
#endif
}

nsresult
nsDanbooruTagHistory::CloseDatabase()
{
#ifdef DANBOORUUP_MORK
  Flush();

  if (mTable)
    mTable->Release();

  if (mStore)
    mStore->Release();

  if (mEnv)
    mEnv->Release();

  mTable = nsnull;
  mEnv = nsnull;
  mStore = nsnull;
#endif
  // mozStorageConnection destructor takes care of this

  return NS_OK;
}

#if 0 || defined(DANBOORUUP_MORK)
nsresult
nsDanbooruTagHistory::OpenExistingFile(const char *aPath)
{
  nsCOMPtr<nsIMdbFile> oldFile;
  nsIMdbHeap* dbHeap = 0;
  mdb_err err = mMdbFactory->OpenOldFile(mEnv, dbHeap, aPath, mdbBool_kFalse, getter_AddRefs(oldFile));
  NS_ENSURE_TRUE(!err && oldFile, NS_ERROR_FAILURE);

  mdb_bool canOpen = 0;
  mdbYarn outFormat = {nsnull, 0, 0, 0, 0, nsnull};
  err = mMdbFactory->CanOpenFilePort(mEnv, oldFile, &canOpen, &outFormat);
  NS_ENSURE_TRUE(!err && canOpen, NS_ERROR_FAILURE);

  nsCOMPtr<nsIMdbThumb> thumb;
  mdbOpenPolicy policy = {{0, 0}, 0, 0};
  err = mMdbFactory->OpenFileStore(mEnv, dbHeap, oldFile, &policy, getter_AddRefs(thumb));
  NS_ENSURE_TRUE(!err && thumb, NS_ERROR_FAILURE);

  PRBool done;
  mdb_err thumbErr = UseThumb(thumb, &done);

  if (err == 0 && done)
    err = mMdbFactory->ThumbToOpenStore(mEnv, thumb, &mStore);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  nsresult rv = CreateTokens();
  NS_ENSURE_SUCCESS(rv, rv);

  mdbOid oid = {kToken_RowScope, 1};
  err = mStore->GetTable(mEnv, &oid, &mTable);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);
  if (!mTable) {
    NS_WARNING("ERROR: Tab history file is corrupt, now deleting it.");
    return NS_ERROR_FAILURE;
  }

  if (NS_FAILED(thumbErr))
    err = thumbErr;

  return err ? NS_ERROR_FAILURE : NS_OK;
}

nsresult
nsDanbooruTagHistory::CreateNewFile(const char *aPath)
{
  nsIMdbHeap* dbHeap = 0;
  nsCOMPtr<nsIMdbFile> newFile;
  mdb_err err = mMdbFactory->CreateNewFile(mEnv, dbHeap, aPath, getter_AddRefs(newFile));
  NS_ENSURE_TRUE(!err && newFile, NS_ERROR_FAILURE);

  nsCOMPtr <nsIMdbTable> oldTable = mTable;;
  nsCOMPtr <nsIMdbStore> oldStore = mStore;
  mdbOpenPolicy policy = {{0, 0}, 0, 0};
  err = mMdbFactory->CreateNewFileStore(mEnv, dbHeap, newFile, &policy, &mStore);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  nsresult rv = CreateTokens();
  NS_ENSURE_SUCCESS(rv, rv);

  // Create the one and only table in the database
  err = mStore->NewTable(mEnv, kToken_RowScope, kToken_Kind, PR_TRUE, nsnull, &mTable);
  NS_ENSURE_TRUE(!err && mTable, NS_ERROR_FAILURE);

   // oldTable will only be set if we detected a corrupt db, and are
   // trying to restore data from it.
  if (oldTable)
    CopyRowsFromTable(oldTable);

  // Force a commit now to get it written out.
  nsCOMPtr<nsIMdbThumb> thumb;
  err = mStore->CompressCommit(mEnv, getter_AddRefs(thumb));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  PRBool done;
  err = UseThumb(thumb, &done);

  return err || !done ? NS_ERROR_FAILURE : NS_OK;
}

nsresult
nsDanbooruTagHistory::CreateTokens()
{
  mdb_err err;

  if (!mStore)
    return NS_ERROR_NOT_INITIALIZED;

  err = mStore->StringToToken(mEnv, "ns:danboorutaghistory:db:row:scope:danboorutaghistory:all", &kToken_RowScope);
  if (err != 0) return NS_ERROR_FAILURE;

  err = mStore->StringToToken(mEnv, "ns:danboorutaghistory:db:table:kind:danboorutaghistory", &kToken_Kind);
  if (err != 0) return NS_ERROR_FAILURE;

  err = mStore->StringToToken(mEnv, "Name", &kToken_NameColumn);
  if (err != 0) return NS_ERROR_FAILURE;

  err = mStore->StringToToken(mEnv, "Value", &kToken_ValueColumn);
  if (err != 0) return NS_ERROR_FAILURE;

  return NS_OK;
}

nsresult
nsDanbooruTagHistory::Flush()
{
  if (!mStore || !mTable)
    return NS_OK;

  mdb_err err;

  nsCOMPtr<nsIMdbThumb> thumb;
  err = mStore->CompressCommit(mEnv, getter_AddRefs(thumb));

  if (err == 0)
    err = UseThumb(thumb, nsnull);

  return err ? NS_ERROR_FAILURE : NS_OK;
}

mdb_err
nsDanbooruTagHistory::UseThumb(nsIMdbThumb *aThumb, PRBool *aDone)
{
  mdb_count total;
  mdb_count current;
  mdb_bool done;
  mdb_bool broken;
  mdb_err err;

  do {
    err = aThumb->DoMore(mEnv, &total, &current, &done, &broken);
  } while ((err == 0) && !broken && !done);

  if (aDone)
    *aDone = done;

  return err ? NS_ERROR_FAILURE : NS_OK;
}

nsresult
nsDanbooruTagHistory::CopyRowsFromTable(nsIMdbTable *sourceTable)
{
  nsCOMPtr<nsIMdbTableRowCursor> rowCursor;
  mdb_err err = sourceTable->GetTableRowCursor(mEnv, -1, getter_AddRefs(rowCursor));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  nsCOMPtr<nsIMdbRow> row;
  mdb_pos pos;
  do {
    rowCursor->NextRow(mEnv, getter_AddRefs(row), &pos);
    if (!row)
      break;

    mdbOid rowId;
    rowId.mOid_Scope = kToken_RowScope;
    rowId.mOid_Id = mdb_id(-1);

    nsCOMPtr<nsIMdbRow> newRow;
    /*mdb_err err =*/ mTable->NewRow(mEnv, &rowId, getter_AddRefs(newRow));
    newRow->SetRow(mEnv, row);
    mTable->AddRow(mEnv, newRow);
  } while (row);
  return NS_OK;
}

nsresult
nsDanbooruTagHistory::AppendRow(const nsAString &aName, const PRInt32 aValue, nsIMdbRow **aResult)
{
  if (!mTable)
    return NS_ERROR_NOT_INITIALIZED;

  PRBool exists;
  EntryExists(aName, aValue, &exists);
  if (exists)
    return NS_OK;

  mdbOid rowId;
  rowId.mOid_Scope = kToken_RowScope;
  rowId.mOid_Id = mdb_id(-1);

  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->NewRow(mEnv, &rowId, getter_AddRefs(row));
  if (err != 0)
    return NS_ERROR_FAILURE;

  SetRowValue(row, kToken_NameColumn, aName);
  SetRowValue(row, kToken_ValueColumn, aValue);
  if (aResult) {
    *aResult = row;
    NS_ADDREF(*aResult);
  }

  return NS_OK;
}

nsresult
nsDanbooruTagHistory::AppendRow(const nsAString &aName, nsIMdbRow **aResult)
{
  if (!mTable)
    return NS_ERROR_NOT_INITIALIZED;

  PRBool exists;
  NameExists(aName, &exists);
  if (exists)
    return NS_OK;

  mdbOid rowId;
  rowId.mOid_Scope = kToken_RowScope;
  rowId.mOid_Id = mdb_id(-1);

  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->NewRow(mEnv, &rowId, getter_AddRefs(row));
  if (err != 0)
    return NS_ERROR_FAILURE;

  SetRowValue(row, kToken_NameColumn, aName);
  SetRowValue(row, kToken_ValueColumn, 0);

  if (aResult) {
    *aResult = row;
    NS_ADDREF(*aResult);
  }
  return NS_OK;
}

nsresult
nsDanbooruTagHistory::SetRowValue(nsIMdbRow *aRow, mdb_column aCol, const nsAString &aValue)
{
	PRInt32 len = aValue.Length() * sizeof(PRUnichar);

	mdbYarn yarn = {(void *)ToNewUnicode(aValue), len, len, 0, 0, nsnull};
	mdb_err err = aRow->AddColumn(mEnv, aCol, &yarn);

	return err ? NS_ERROR_FAILURE : NS_OK;
	return NS_OK;
}

nsresult
nsDanbooruTagHistory::SetRowValue(nsIMdbRow *aRow, mdb_column aCol, const PRInt32 aValue)
{
	nsCAutoString buf; buf.AppendInt(aValue);

	mdbYarn yarn = { (void *)buf.get(), buf.Length(), buf.Length(), 0, 0, nsnull };
	mdb_err err = aRow->AddColumn(mEnv, aCol, &yarn);

	return err ? NS_ERROR_FAILURE : NS_OK;
	return NS_OK;
}

nsresult
nsDanbooruTagHistory::GetRowValue(nsIMdbRow *aRow, mdb_column aCol, nsAString &aValue)
{

	mdbYarn yarn;
	mdb_err err = aRow->AliasCellYarn(mEnv, aCol, &yarn);
	if (err != 0)
		return NS_ERROR_FAILURE;

	aValue.Truncate(0);
	if (!yarn.mYarn_Fill)
		return NS_OK;

	switch (yarn.mYarn_Form) {
		case 0: // unicode
			aValue.Assign((const PRUnichar *)yarn.mYarn_Buf, yarn.mYarn_Fill/sizeof(PRUnichar));
			break;
		default:
			return NS_ERROR_UNEXPECTED;
	}
	return NS_OK;
}

nsresult
nsDanbooruTagHistory::GetRowValue(nsIMdbRow *aRow, mdb_column aCol,
				PRInt32 *aResult)
{
	mdbYarn yarn;
	mdb_err err = aRow->AliasCellYarn(mEnv, aCol, &yarn);
	if (err != 0) return NS_ERROR_FAILURE;

	if (yarn.mYarn_Buf)
		*aResult = atoi((char *)yarn.mYarn_Buf);
	else
		*aResult = 0;
	return NS_OK;
}
#endif

nsresult
nsDanbooruTagHistory::AutoCompleteSearch(const nsAString &aInputName,
#ifdef DANBOORUUP_MORK
                                  nsIAutoCompleteMdbResult *aPrevResult,
#else
                                  nsIAutoCompleteArrayResult *aPrevResult,
#endif
                                  nsIAutoCompleteResult **aResult)
{
	if (!TagHistoryEnabled())
		return NS_OK;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

#if 0 || defined(DANBOORUUP_MORK)
	nsCOMPtr<nsIAutoCompleteMdbResult> result;

	if (aPrevResult) {
		result = aPrevResult;

		PRUint32 rowCount;
		result->GetMatchCount(&rowCount);
		for (PRInt32 i = rowCount-1; i >= 0; --i) {
			nsIMdbRow *row;
			result->GetRowAt(i, &row);
			if (!RowMatch(row, aInputName, nsnull))
				result->RemoveValueAt(i, PR_FALSE);
		}
	} else {
		result = do_CreateInstance("@mozilla.org/autocomplete/mdb-result;1");

		//nsAutoString buf; buf.AppendInt(aInputName);
		result->SetSearchString(aInputName);
		result->Init(mEnv, mTable);
		result->SetTokens(kToken_NameColumn, nsIAutoCompleteMdbResult::kUnicharType, kToken_ValueColumn, nsIAutoCompleteMdbResult::kIntType);

		// Get a cursor to iterate through all rows in the database
		nsCOMPtr<nsIMdbTableRowCursor> rowCursor;
		mdb_err err = mTable->GetTableRowCursor(mEnv, -1, getter_AddRefs(rowCursor));
		NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

		// Store only the matching values
		nsAutoVoidArray matchingValues;
		nsCOMArray<nsIMdbRow> matchingRows;

		nsCOMPtr<nsIMdbRow> row;
		mdb_pos pos;
		nsAutoString name;
		PRInt32 value;
		do {
			rowCursor->NextRow(mEnv, getter_AddRefs(row), &pos);
			if (!row)
				break;

			if (RowMatch(row, aInputName, &value)) {
				matchingRows.AppendObject(row);
				GetRowValue(row, kToken_NameColumn, name);
				matchingValues.AppendElement(ToNewUnicode(name));
				matchingValues.AppendElement((void*)value);
			}
		} while (row);

		// Turn auto array into flat array for quick sort, now that we
		// know how many items there are
		PRUint32 count = matchingRows.Count();

		if (count > 0) {
			PRUint32* items = new PRUint32[count];
			PRUint32 i;
			for (i = 0; i < count; ++i)
				items[i] = i;

			NS_QuickSort(items, count, sizeof(PRUint32),
					SortComparison, &matchingValues);

			for (i = 0; i < count; ++i) {
				// Place the sorted result into the autocomplete result
				result->AddRow(matchingRows[items[i]]);

				// Free up these strings we owned.
				// Only the strings.
				if(!(i&1))
					NS_Free(matchingValues[i]);
			}

			delete[] items;
		}
#else
	nsCOMPtr<nsIAutoCompleteArrayResult> result;
	if (aPrevResult) {
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
		result = do_CreateInstance("@mozilla.org/autocomplete/array-result;1");
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
		nsAutoString name;
		mSearchStmt->BindStringParameter(0, aInputName);
		mSearchStmt->ExecuteStep(&row);
		while (row)
		{
			mSearchStmt->GetAsString(0, name);
			result->AddRow(name);
			mSearchStmt->ExecuteStep(&row);
		}
		mSearchStmt->Reset();
#endif
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

#if 0 || defined(DANBOORUUP_MORK)
int PR_CALLBACK
nsDanbooruTagHistory::SortComparison(const void *v1, const void *v2, void *closureVoid)
{
	PRUint32 *index1 = (PRUint32 *)v1;
	PRUint32 *index2 = (PRUint32 *)v2;
	nsAutoVoidArray *array = (nsAutoVoidArray *)closureVoid;

	PRUnichar *s1 = (PRUnichar *)array->ElementAt(2 * *index1);
	PRUnichar *s2 = (PRUnichar *)array->ElementAt(2 * *index2);
	PRInt32 n1 = (PRInt32)array->ElementAt(1 + 2 * *index1);
	PRInt32 n2 = (PRInt32)array->ElementAt(1 + 2 * *index2);

	if (n1 == n2)
		return nsCRT::strcmp(s1, s2);
	if (n1 > n2)
		return -1;
	return 1;
}

PRBool
nsDanbooruTagHistory::RowMatch(nsIMdbRow *aRow, const nsAString &aInputName, const PRInt32 aInputValue, PRInt32 *aValue)
{
	nsAutoString name;
	GetRowValue(aRow, kToken_NameColumn, name);

	if (Compare(Substring(name, 0, aInputName.Length()), aInputName, nsCaseInsensitiveStringComparator()) == 0) {
		PRInt32 value;
		GetRowValue(aRow, kToken_ValueColumn, &value);
		if (value == aInputValue) {
			if (aValue)
				*aValue = value;
			return PR_TRUE;
		}
	}

	return PR_FALSE;
}

PRBool
nsDanbooruTagHistory::RowMatch(nsIMdbRow *aRow, const nsAString &aInputName, PRInt32 *aValue)
{
	nsAutoString name;
	GetRowValue(aRow, kToken_NameColumn, name);
#if 0
nsCOMPtr<nsIConsoleService> console = do_GetService("@mozilla.org/consoleservice;1");
if (console)
{
	char *p = ToNewCString(aInputName);
	char *q = ToNewCString(name);
	nsPrintfCString bob(" - matching %s with %s", p, q);
	PRUnichar *jim = ToNewUnicode(bob);
	console->LogStringMessage(jim);
#ifdef DEBUG
	NS_NAMED_LITERAL_STRING(a," - matching ");
	NS_NAMED_LITERAL_STRING(b," - ");
	nsString joe = a +aInputName +b +name;
	char *z = ToNewCString(joe);
	fprintf(stderr, "%s\n", z);
	nsMemory::Free(z);
#endif
	nsMemory::Free(p);
	nsMemory::Free(q);
	nsMemory::Free(jim);
}
#endif
	if (Compare(Substring(name, 0, aInputName.Length()), aInputName, nsCaseInsensitiveStringComparator()) == 0) {
		if (aValue) {
			PRInt32 value;
			GetRowValue(aRow, kToken_ValueColumn, &value);
			*aValue = value;
		}
		return PR_TRUE;
	}

	return PR_FALSE;
}
#endif

#ifdef DANBOORUUP_MORK
nsresult
nsDanbooruTagHistory::EntriesExistInternal(const nsAString *aName, const PRInt32 aValue, PRBool *_retval)
{
  // Unfortunately we have to do a brute force search through the database
  // because mork didn't bother to implement any indexing functionality

  *_retval = PR_FALSE;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  // Get a cursor to iterate through all rows in the database
  nsCOMPtr<nsIMdbTableRowCursor> rowCursor;
  mdb_err err = mTable->GetTableRowCursor(mEnv, -1, getter_AddRefs(rowCursor));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  nsCOMPtr<nsIMdbRow> row;
  mdb_pos pos;
  do {
    rowCursor->NextRow(mEnv, getter_AddRefs(row), &pos);
    if (!row)
      break;

    // Check if the name and value combination match this row
    nsAutoString name;
    GetRowValue(row, kToken_NameColumn, name);

    if (Compare(name, *aName, nsCaseInsensitiveStringComparator()) == 0) {
      PRInt32 value;
      GetRowValue(row, kToken_ValueColumn, &value);
      if (value == aValue) {
        *_retval = PR_TRUE;
        break;
      }
    }
  } while (1);

  return NS_OK;
}

nsresult
nsDanbooruTagHistory::RemoveEntriesInternal(const nsAString *aName)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  if (!mTable) return NS_OK;

  mdb_err err;
  mdb_count count;
  nsAutoString name;
  err = mTable->GetCount(mEnv, &count);
  if (err != 0) return NS_ERROR_FAILURE;

  // Begin the batch.
  int marker;
  err = mTable->StartBatchChangeHint(mEnv, &marker);
  NS_ASSERTION(err == 0, "unable to start batch");
  if (err != 0) return NS_ERROR_FAILURE;

  for (mdb_pos pos = count - 1; pos >= 0; --pos) {
    nsCOMPtr<nsIMdbRow> row;
    err = mTable->PosToRow(mEnv, pos, getter_AddRefs(row));
    NS_ASSERTION(err == 0, "unable to get row");
    if (err != 0)
      break;

    NS_ASSERTION(row != nsnull, "no row");
    if (! row)
      continue;

    // Check if the name matches this row
    GetRowValue(row, kToken_NameColumn, name);

    if (!aName || Compare(name, *aName, nsCaseInsensitiveStringComparator()) == 0) {

      // Officially cut the row *now*, before notifying any observers:
      // that way, any re-entrant calls won't find the row.
      err = mTable->CutRow(mEnv, row);
      NS_ASSERTION(err == 0, "couldn't cut row");
      if (err != 0)
        continue;

      // possibly avoid leakage
      err = row->CutAllColumns(mEnv);
      NS_ASSERTION(err == 0, "couldn't cut all columns");
      // we'll notify regardless of whether we could successfully
      // CutAllColumns or not.
    }

  }

  // Finish the batch.
  err = mTable->EndBatchChangeHint(mEnv, &marker);
  NS_ASSERTION(err == 0, "error ending batch");

  return (err == 0) ? NS_OK : NS_ERROR_FAILURE;

}
#endif

