/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: t; c-basic-offset: 2 -*- */
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

#include "danbooruTagHistoryService.h"

#include "nsIServiceManager.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsIIOService.h"
#include "nsIChannel.h"
#include "nsNetCID.h"
#include "nsIObserverService.h"
#include "nsICategoryManager.h"
#include "nsIDirectoryService.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsISupportsPrimitives.h"
#include "nsIConsoleService.h"

#ifndef MOZILLA_1_8_BRANCH
#include "nsIProxyObjectManager.h"
#include "nsAutoLock.h"
#endif

#include "danbooruAutoCompleteArrayResult.h"

#include "nspr.h"

#ifdef MOZILLA_1_8_BRANCH
#define nsString_h___
#include "nsICaseConversion.h"
#include "nsUnicharUtilCIID.h"
#undef nsString_h___
#else
#include "nsUnicharUtils.h"
#endif

// Update/Process
//#include "nsNetUtil.h"
#include "nsIDOMEventTarget.h"
#include "nsIDOMDocument.h"
#include "nsIDOMElement.h"
#include "nsIDOM3Node.h"
#include "nsIDOMNodeList.h"

#include "nsIPrefService.h"
#include "nsIPrefBranch2.h"
#include "nsVoidArray.h"
#include "nsCOMArray.h"
#include "mozIStorageService.h"
#include "mozStorageCID.h"

#define PREF_DANBOORUUP_AC_BRANCH "extensions.danbooruUp.autocomplete."
#define PREF_DANBOORUUP_AC_ENABLE "enabled"
#define PREF_DANBOORUUP_AC_LIMIT "limit"
#define PREF_DANBOORUUP_AC_ALTSEARCH "altsearch"

#define DANBOORUPROCESSTAGS_TOPIC "danbooru-process-tags"

static const char *kTagHistoryFileName = "danbooruhistory.sqlite";
static const char *kRelTagFileName = "danboorurelated.sqlite";

static const char *kTagTableName = "tags";

#define kApiZeroCount "include_zero_posts=1"

#define kTagHistorySchema "id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, value INTEGER NOT NULL DEFAULT 0, tag_type INTEGER NOT NULL DEFAULT 0"
// temporary table for cleanup join
#define kCreateTempTagTable "CREATE TEMPORARY TABLE tagselect (id INTEGER, name TEXT, value INTEGER NOT NULL DEFAULT 0, tag_type INTEGER NOT NULL DEFAULT 0)"
#define kCreateTempTagIndex "CREATE INDEX tagselect_idx_id ON tagselect (id)"
#define kTempTagInsert "INSERT OR REPLACE INTO tagselect (id, name, tag_type) VALUES (?1, ?2, ?3)"
#define kDropTempTagIndex "DROP INDEX tagselect_idx_id"
#define kDropTempTagTable "DROP TABLE tagselect"
#define kTruncateTempTagTable "DELETE FROM tagselect"
// and the cleanup join
#define kTagClean "DELETE FROM tags WHERE id IN (SELECT t.id FROM tags t LEFT OUTER JOIN tagselect s ON t.id=s.id WHERE s.id IS NULL)"
#define kTagInsert "INSERT OR IGNORE INTO tags (id, name, tag_type) VALUES (?1, ?2, ?3)"
#define kTagUpdateType "UPDATE tags SET tag_type=?1 WHERE id=?2"
#define kTagIncrement "UPDATE tags SET value=value+1 WHERE name=?1"
#define kTagSearch "SELECT name, tag_type FROM tags WHERE name LIKE ?1 ESCAPE '\\' ORDER BY value DESC, name ASC LIMIT ?2"
#define kTagSearchAlt "SELECT name, tag_type FROM tags WHERE name LIKE ?1 ESCAPE '\\' ORDER BY value DESC, LENGTH(name) ASC, name ASC LIMIT ?2"
#define kTagExists "SELECT NULL FROM tags WHERE name=?1"
#define kTagRemoveByID "DELETE FROM tags WHERE id=?1"
#define kTagIDForName "SELECT id FROM tags WHERE name=?1"
#define kRemoveAll "DELETE FROM tags"
#define kMaxID "SELECT max(id) FROM tags"
#define kRowCount "SELECT count() FROM tags"

// related tags
#define kAttachRTDB "ATTACH ?1 AS \"rt\""
#define kDetachRTDB "DETACH \"rt\""
#define kRelTagSearch "SELECT t.name, t.tag_type FROM tags t JOIN rt.cached_tags r ON t.id = r.related_tag_id WHERE r.related_tag_id != ?1 AND r.tag_id = ?1 ORDER BY t.tag_type ASC, t.value DESC, r.post_count DESC"

// migration
#define kTableIsV2 "SELECT tag_type FROM tags LIMIT 0"
#define kTableMigrateV1_V2 "ALTER TABLE tags ADD COLUMN tag_type INTEGER NOT NULL DEFAULT 0"

// maintenance
#define kTableHasNoValueConstraintCheck1 "INSERT OR REPLACE INTO tags (id, name, tag_type) VALUES (-1,'danbooruup_null_test',0)"
#define kTableHasNoValueConstraintCheck2 "SELECT COUNT(*) FROM tags WHERE name='danbooruup_null_test' AND value IS NULL"
#define kTableHasNoValueConstraintCheck3 "DELETE FROM tags WHERE name = 'danbooruup_null_test'"
#define kDeleteDuplicateNames "DELETE FROM tags WHERE id IN (SELECT t.id FROM tags t JOIN (SELECT MAX(id) AS maxid, name FROM tags GROUP BY name HAVING COUNT(name)>1) dt ON t.name = dt.name WHERE t.id < dt.maxid)"
#define kCopyData "INSERT INTO tagselect (id, name, value, tag_type) SELECT t.id, t.name, (CASE WHEN t.value IS NULL THEN 0 ELSE t.value END), t.tag_type FROM tags t"
#define kDropOldTable "DROP TABLE tags"
#define kRepopulateNewTable "INSERT INTO tags (id, name, value, tag_type) SELECT t.id, t.name, t.value, t.tag_type FROM tagselect t"

NS_INTERFACE_MAP_BEGIN(danbooruTagHistoryService)
  NS_INTERFACE_MAP_ENTRY(danbooruITagHistoryService)
  NS_INTERFACE_MAP_ENTRY(nsIDOMEventListener)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
#ifndef MOZILLA_1_8_BRANCH
  NS_INTERFACE_MAP_ENTRY(nsIRunnable)
#endif
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, danbooruITagHistoryService)
NS_INTERFACE_MAP_END_THREADSAFE

NS_IMPL_THREADSAFE_ADDREF(danbooruTagHistoryService)
NS_IMPL_THREADSAFE_RELEASE(danbooruTagHistoryService)

#ifdef DANBOORUUP_TESTING
PRBool danbooruTagHistoryService::gTagHistoryEnabled = PR_TRUE;
PRBool danbooruTagHistoryService::gPrefsInitialized = PR_TRUE;
#else
PRBool danbooruTagHistoryService::gTagHistoryEnabled = PR_FALSE;
PRBool danbooruTagHistoryService::gPrefsInitialized = PR_FALSE;
#endif
PRInt32 danbooruTagHistoryService::gSearchLimit = 0;
PRBool danbooruTagHistoryService::gAltSearch = PR_FALSE;

#ifdef MOZILLA_1_8_BRANCH
// this crap doesn't exist in 1.8 branch glue

typedef PRInt32 (*ComparatorFunc)(const PRUnichar *a, const PRUnichar *b, PRUint32 length);

static int
NS_strcmp(const PRUnichar *a, const PRUnichar *b)
{
  while (*b) {
    int r = *a - *b;
    if (r)
      return r;

    ++a;
    ++b;
  }

  return *a != '\0';
}

/*
static PRUint32
NS_strlen(const PRUnichar *aString)
{
  const PRUnichar *end;

  for (end = aString; *end; ++end) {
    // empty loop
  }

  return end - aString;
}
*/

static PRBool
Equals(const nsAString &str, const nsDependentSubstring &other, ComparatorFunc c)
{
  const PRUnichar *cself, *cother;
  PRUint32 selflen = NS_StringGetData(str, &cself);
  NS_StringGetData(other, &cother);
  PRUint32 otherlen = other.Length();

  if (selflen != otherlen)
    return PR_FALSE;

  return c(cself, cother, selflen) == 0;
}

static nsICaseConversion* gCaseConv = nsnull;

static nsICaseConversion*
NS_GetCaseConversion()
{
  if (!gCaseConv) {
    nsresult rv = CallGetService(NS_UNICHARUTIL_CONTRACTID, &gCaseConv);
    if (NS_FAILED(rv)) {
      NS_ERROR("Failed to get the case conversion service!");
      gCaseConv = nsnull;
    }
  }
  return gCaseConv;
}

static PRInt32
CaseInsensitiveCompare(const PRUnichar *a,
                       const PRUnichar *b,
                       PRUint32 len)
{
  nsICaseConversion* caseConv = NS_GetCaseConversion();
  if (!caseConv)
    return NS_strcmp(a, b);

  PRInt32 result;
  caseConv->CaseInsensitiveCompare(a, b, len, &result);
  return result;
}
#endif

// XXX hurry up and move this out of extensions/metrics/src/nsStringUtils.cpp already, dudes
static PRInt32 FindChar(const nsAString &str, PRUnichar c)
{
  const PRUnichar *start;
  PRUint32 len = NS_StringGetData(str, &start);
  const PRUnichar *iter = start, *end = start + len;
  for (; iter != end; ++iter) {
    if (*iter == c)
      return iter - start;
  }
  return -1;
}

// Replace all occurances of |matchVal| with |newVal|
static void ReplaceSubstring(nsAString& str, const nsAString& matchVal, const nsAString& newVal)
{
	const PRUnichar* sp, *mp, *np;
	PRUint32 sl, ml, nl;

	sl = NS_StringGetData(str, &sp);
	ml = NS_StringGetData(matchVal, &mp);
	nl = NS_StringGetData(newVal, &np);

	for (const PRUnichar* iter = sp; iter <= sp + sl - ml; ++iter)
	{
		if (memcmp(iter, mp, ml) == 0)
		{
			PRUint32 offset = iter - sp;

			NS_StringSetDataRange(str, offset, ml, np, nl);

			sl = NS_StringGetData(str, &sp);

			iter = sp + offset + nl - 1;
		}
	}
}

danbooruTagHistoryService::danbooruTagHistoryService() :
	mDB(nsnull),
	mRequest(nsnull),
	mNodeList(nsnull),
	mRelatedTagsAvailable(PR_FALSE)
{
#ifndef MOZILLA_1_8_BRANCH
	mLock = PR_NewLock();
#endif
}

danbooruTagHistoryService::~danbooruTagHistoryService()
{
	gTagHistory = nsnull;
	//NS_IF_RELEASE(gCaseConv);
	CloseDatabase();

	nsCOMPtr<nsIObserverService> service = do_GetService("@mozilla.org/observer-service;1");
	if (service)
	  service->RemoveObserver(this, DANBOORUPROCESSTAGS_TOPIC);

#ifndef MOZILLA_1_8_BRANCH
	PR_DestroyLock(mLock);
#endif
}

nsresult
danbooruTagHistoryService::Init()
{
	gTagHistory = this;

	nsCOMPtr<nsIObserverService> service = do_GetService("@mozilla.org/observer-service;1");
	if (service)
	  service->AddObserver(this, DANBOORUPROCESSTAGS_TOPIC, PR_TRUE);

  if (!gPrefsInitialized) {
    nsCOMPtr<nsIPrefService> prefService = do_GetService(NS_PREFSERVICE_CONTRACTID);

    prefService->GetBranch(PREF_DANBOORUUP_AC_BRANCH,
                           getter_AddRefs(gTagHistory->mPrefBranch));
    gTagHistory->mPrefBranch->GetBoolPref(PREF_DANBOORUUP_AC_ENABLE,
                                           &gTagHistoryEnabled);
		gTagHistory->mPrefBranch->GetIntPref(PREF_DANBOORUUP_AC_LIMIT, &gSearchLimit);
		gTagHistory->mPrefBranch->GetBoolPref(PREF_DANBOORUUP_AC_ALTSEARCH, &gAltSearch);

    nsCOMPtr<nsIPrefBranch2> branchInternal =
      do_QueryInterface(gTagHistory->mPrefBranch);
    branchInternal->AddObserver(PREF_DANBOORUUP_AC_ENABLE, gTagHistory, PR_TRUE);
    branchInternal->AddObserver(PREF_DANBOORUUP_AC_LIMIT, gTagHistory, PR_TRUE);
    branchInternal->AddObserver(PREF_DANBOORUUP_AC_ALTSEARCH, gTagHistory, PR_TRUE);

    gPrefsInitialized = PR_TRUE;
  }

	return NS_OK;
}

danbooruTagHistoryService *danbooruTagHistoryService::gTagHistory = nsnull;

danbooruTagHistoryService *
danbooruTagHistoryService::GetInstance()
{
	if (gTagHistory) {
		NS_ADDREF(gTagHistory);
		return gTagHistory;
	}

	gTagHistory = new danbooruTagHistoryService();
	if (gTagHistory) {
		NS_ADDREF(gTagHistory);  // addref for the global
		if (NS_FAILED(gTagHistory->Init())) {
			NS_RELEASE(gTagHistory);
		}
	}
	return gTagHistory;
}


/* static */ PRBool
danbooruTagHistoryService::TagHistoryEnabled()
{
  return gTagHistoryEnabled;
}

////////////////////////////////////////////////////////////////////////
//// nsIRunnable

#ifndef MOZILLA_1_8_BRANCH
NS_IMETHODIMP
danbooruTagHistoryService::Run()
{
	ProcessTagXML();
	return NS_OK;
}
#endif

////////////////////////////////////////////////////////////////////////
//// nsIDanbooruTagHistoryService

#ifndef MOZILLA_1_8_BRANCH
class danbooruNodeProcessEvent : public nsRunnable
{
public:
	danbooruNodeProcessEvent(PRUint32 type = MSG_PROCESSNODES) : mType(type) { }

	NS_IMETHOD Run() {
		danbooruTagHistoryService *tagservice = danbooruTagHistoryService::GetInstance();
		if (mType == MSG_PROCESSNODES)
			tagservice->ProcessNodes();
		else if (mType == MSG_COMPLETE)
			tagservice->FinishProcessingNodes();
		NS_RELEASE(tagservice);
		return NS_OK;
	}

	enum
	{
		MSG_PROCESSNODES,
		MSG_COMPLETE
	};
	PRUint32 mType;
};

void
danbooruTagHistoryService::ProcessNodes()
{
	nsCOMPtr<nsIDOMNode> child;
	nsString tagid, tagname, tagtype;

	PR_Lock(mLock);

	mIdArray.Clear();
	mNameArray.Clear();
	mTypeArray.Clear();

	for(PRUint32 i=0; i < mStep && mNodes; i++, mNodes--) {
		mNodeList->Item(mNodes, getter_AddRefs(child));
		if (!child)
			continue;

		nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
		if (!childElement)
			continue;

		childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
		childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
		childElement->GetAttribute(NS_LITERAL_STRING("type"), tagtype);
		if (!tagname.IsEmpty()) {
			mTagNodeCount++;
			mIdArray.AppendString(tagid);
			mNameArray.AppendString(tagname);
			mTypeArray.AppendString(tagtype);
		}
	}
	PR_Unlock(mLock);

	if (mProgress)
	{
		PRUint32 total;
		mNodeList->GetLength(&total);
		mProgress->OnProgress(nsnull, nsnull, total - mNodes, total);
	}
}

void
danbooruTagHistoryService::FinishProcessingNodes()
{
	if (!mNodeList)
		return;

	nsAutoLock lock(mLock);

	mIdArray.Clear();
	mNameArray.Clear();
	mTypeArray.Clear();

	mNodeList = nsnull;
	mRequest = nsnull;
	mThread->Shutdown();
	mThread = nsnull;

	nsresult rv;
	nsCOMPtr<nsISupportsPRUint32> nodect = do_CreateInstance(NS_SUPPORTS_PRUINT32_CONTRACTID, &rv);
	if (NS_FAILED(rv))
		return;

	rv = nodect->SetData(mTagNodeCount);
	if (NS_FAILED(rv))
		return;

	nsCOMPtr<nsIObserverService> service(do_GetService("@mozilla.org/observer-service;1", &rv));
	if (NS_FAILED(rv))
		return;

	service->NotifyObservers(nodect, "danbooru-update-done", nsnull);
}
#endif

nsresult
danbooruTagHistoryService::ProcessTagXML()
{
	NS_ENSURE_TRUE(mNodeList != nsnull, NS_ERROR_FAILURE);

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	PRUint32 index = 0;

	nsCOMPtr<nsIDOMNode> child;
	nsString tagid, tagname, tagtype;

#ifdef MOZILLA_1_8_BRANCH
	PRUint32 count = 0;
	nsCOMPtr<nsIObserverService> service(do_GetService("@mozilla.org/observer-service;1"));
#else
	mTagNodeCount = 0;
	if (mNodes >= 100000) {
		mStep = 1000;
	} else {
		mStep = 100;
	}
#endif

	if (mInserting) {	// adding new tags
		mDB->BeginTransaction();
#ifdef MOZILLA_1_8_BRANCH
		while (index < mNodes) {
			mNodeList->Item(index++, getter_AddRefs(child));
			nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));

			if (!childElement) {
				continue;
			}

			// left as a string because sqlite will turn it into an int anyway
			childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
			childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
			childElement->GetAttribute(NS_LITERAL_STRING("type"), tagtype);
			if (!tagname.IsEmpty()) {
				count++;
#if defined(DANBOORUUP_TESTING)
{
	NS_NAMED_LITERAL_STRING(a,"inserting ");
	NS_NAMED_LITERAL_STRING(b," - ");
	nsString bob= a;
	bob += tagid;
	bob += b;
	bob += tagname;
	PR_fprintf(PR_STDERR, "%s\n", NS_ConvertUTF16toUTF8(bob).get());
}
#endif
#else // !defined(MOZILLA_1_8_BRANCH)
		nsCOMPtr<nsIRunnable> event = new danbooruNodeProcessEvent(danbooruNodeProcessEvent::MSG_PROCESSNODES);
		while (mNodes)
		{
			if(NS_FAILED(NS_DispatchToMainThread(event, NS_DISPATCH_SYNC))) {
				mDB->RollbackTransaction();
				return NS_ERROR_FAILURE;
			}
			PR_Lock(mLock);
			for (index = 0; (PRInt32)index < mIdArray.Count(); index++) {
				mIdArray.StringAt(index, tagid);
				mNameArray.StringAt(index, tagname);
				mTypeArray.StringAt(index, tagtype);
#endif // defined(MOZILLA_1_8_BRANCH)
				mInsertStmt->BindStringParameter(0, tagid);
				mInsertStmt->BindStringParameter(1, tagname);
				mInsertStmt->BindStringParameter(2, tagtype);
				mInsertStmt->Execute();
				// update tag type since sqlite doesn't have an ON CONFLICT UPDATE clause like mysql
				mUpdateTypeStmt->BindStringParameter(0, tagtype);
				mUpdateTypeStmt->BindStringParameter(1, tagid);
				mUpdateTypeStmt->Execute();
			}
#ifndef MOZILLA_1_8_BRANCH
			PR_Unlock(mLock);
#endif
		}
		mDB->CommitTransaction();
	} else {	// pruning old tags
		mDB->BeginTransaction();
#ifdef MOZILLA_1_8_BRANCH
		while (index < mNodes) {
			mNodeList->Item(index++, getter_AddRefs(child));
			nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
			if (!childElement) {
				continue;
			}

			childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
			childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
			childElement->GetAttribute(NS_LITERAL_STRING("type"), tagtype);
			if (!tagname.IsEmpty()) {
				count++;
#else
		nsCOMPtr<nsIRunnable> event = new danbooruNodeProcessEvent(danbooruNodeProcessEvent::MSG_PROCESSNODES);
		while (mNodes) {
			if(NS_FAILED(NS_DispatchToMainThread(event, NS_DISPATCH_SYNC))) {
				mDB->RollbackTransaction();
				mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTruncateTempTagTable));
				return NS_ERROR_FAILURE;
			}
			PR_Lock(mLock);
			for (index = 0; (PRInt32)index < mIdArray.Count(); index++) {
				mIdArray.StringAt(index, tagid);
				mNameArray.StringAt(index, tagname);
				mTypeArray.StringAt(index, tagtype);
#endif
				mTempInsertStmt->BindStringParameter(0, tagid);
				mTempInsertStmt->BindStringParameter(1, tagname);
				mTempInsertStmt->BindStringParameter(2, tagtype);
				mTempInsertStmt->Execute();
			}
#ifndef MOZILLA_1_8_BRANCH
			PR_Unlock(mLock);
#endif
		}
		mDB->CommitTransaction();

		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kCreateTempTagIndex));
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTagClean));
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kDropTempTagIndex));
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTruncateTempTagTable));
	}

	if (mProgress)
	{
		mProgress = nsnull;
	}
#ifndef MOZILLA_1_8_BRANCH
	nsCOMPtr<nsIRunnable> event = new danbooruNodeProcessEvent(danbooruNodeProcessEvent::MSG_COMPLETE);
	NS_DispatchToMainThread(event);

	/*
	nsCOMPtr<nsIProxyObjectManager> proxyMgr(do_GetService("@mozilla.org/xpcomproxy;1"));
	nsCOMPtr<nsIThread> proxy;
	nsIThread *current;
	NS_GetCurrentThread(&current);

	proxyMgr->GetProxyForObject(NS_PROXY_TO_MAIN_THREAD,
					NS_GET_IID(nsIThread),
					current,
					NS_PROXY_ASYNC,
					getter_AddRefs(proxy));
	if (proxy) {
		proxy->Shutdown();
	} else {
		NS_WARNING("danbooruTagHistoryService leaking thread");
	}
	*/
#else
	nsCOMPtr<nsISupportsPRUint32> nodes = do_CreateInstance(NS_SUPPORTS_PRUINT32_CONTRACTID);
	if (NS_FAILED(rv))
		return rv;
	rv = nodes->SetData(count);
	if (NS_FAILED(rv))
		return rv;

	service->NotifyObservers(nodes, "danbooru-update-done", nsnull);

	mNodeList = nsnull;
#endif
	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::HandleEvent(nsIDOMEvent* aEvent)
{
	NS_PRECONDITION(mRequest, "no previous tag update request");

	PRUint32 status;
	nsresult rv = mRequest->GetStatus(&status);
	if (NS_FAILED(rv)) {
		return rv;
	}
	if (status != 200)
	{
		nsCOMPtr<nsIObserverService> service(do_GetService("@mozilla.org/observer-service;1", &rv));
		if (NS_FAILED(rv))
			return rv;

		if (service)
			service->NotifyObservers(mRequest, "danbooru-update-failed", nsnull);
		return NS_OK;
	}

#ifdef DANBOORUUP_TESTING
	PR_fprintf(PR_STDERR,"processing %s\n", mInserting?"insertion":"removal");
#endif

	nsCOMPtr<nsIDOMDocument> document;
	rv = mRequest->GetResponseXML(getter_AddRefs(document));
	if (NS_FAILED(rv)) {
		return rv;
	}

	nsCOMPtr<nsIDOMElement> element;
	document->GetDocumentElement(getter_AddRefs(element));
	NS_ENSURE_TRUE(element != nsnull, NS_ERROR_FAILURE);

	//nsCOMPtr<nsIDOMNodeList> nodeList;
	element->GetChildNodes(getter_AddRefs(mNodeList));
	if (!mNodeList) {
		// no tags?
#ifdef DANBOORUUP_TESTING
 		NS_WARNING("no tags");
#endif
		mNodeList = nsnull;
		return NS_OK;
	}

	mNodeList->GetLength(&mNodes);
#if defined(DANBOORUUP_TESTING) || defined(DEBUG)
 	PR_fprintf(PR_STDERR, "got %d nodes\n", mNodes);
#endif

	// check for disparity between node counts
	if (!mInserting)
	{
		PRUint32 rowcount;
		PRUint32 nodes=0;
		GetRowCount(&rowcount);
		// count the number of non-text nodes
		nsCOMPtr<nsIDOMNode> child;
		nsString tagid;

		for(PRUint32 i=0; i < mNodes; i++) {
			mNodeList->Item(i, getter_AddRefs(child));
			nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
			if (!childElement) {
				continue;
			}

			childElement->GetAttribute(NS_LITERAL_STRING("id"), tagid);
			if (tagid.IsEmpty()) {
				continue;
			}
			nodes++;
		}

		// ask user when received tags are smaller by an arbitrary fraction
		if ((double)nodes/rowcount <= 0.9)
		{
			nsCOMPtr<nsIObserverService> service(do_GetService("@mozilla.org/observer-service;1", &rv));
			NS_ENSURE_SUCCESS(rv,rv);

			if (service)
			{
				nsCOMPtr<nsISupportsPRUint32> nodect = do_CreateInstance(NS_SUPPORTS_PRUINT32_CONTRACTID);
				NS_ENSURE_SUCCESS(rv,rv);
				rv = nodect->SetData(nodes);
				NS_ENSURE_SUCCESS(rv,rv);
				service->NotifyObservers(nodect, "danbooru-cleanup-confirm", nsnull);
			}
			return NS_OK;
		}
	}
	return StartTagProcessing();
}

nsresult
danbooruTagHistoryService::StartTagProcessing()
{
	nsresult rv;
#ifdef MOZILLA_1_8_BRANCH
	rv = ProcessTagXML();
	mRequest = nsnull;
#else
	rv = NS_NewThread(getter_AddRefs(mThread), this);
#endif
	return rv;
}

/* used to be the nsISchema load */
NS_IMETHODIMP
danbooruTagHistoryService::UpdateTagListFromURI(const nsAString &aXmlURI, PRBool insert, nsIInterfaceRequestor *notification)
{
	if(!gTagHistoryEnabled)
		return NS_ERROR_NOT_AVAILABLE;

	if(mRequest) {
		PRInt32 st;
		mRequest->GetReadyState(&st);
#ifdef DANBOORUUP_TESTING
		PR_fprintf(PR_STDERR,"previous state %d\n", st);
#endif
		// GetReadyState doesn't return mState -- oops
		if(st != 4)
			return NS_ERROR_NOT_AVAILABLE;
	}

	nsresult rv;
	mRequest = do_CreateInstance(NS_XMLHTTPREQUEST_CONTRACTID, &rv);
	if (!mRequest) {
		return rv;
	}

	const nsAString& empty = EmptyString();
	rv = mRequest->OpenRequest(NS_LITERAL_CSTRING("GET"), NS_ConvertUTF16toUTF8(aXmlURI), PR_TRUE, empty, empty);
	if (NS_FAILED(rv)) {
		return rv;
	}
	if (notification) {
		nsCOMPtr<nsIChannel> channel;
		mProgress = do_QueryInterface(notification);
		rv = mRequest->GetChannel(getter_AddRefs(channel));
		if (NS_SUCCEEDED(rv))
		{
			channel->SetNotificationCallbacks(notification);
			channel->SetLoadFlags(nsIRequest::LOAD_NORMAL);
		}
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
	PR_fprintf(PR_STDERR,"getting data\n", rv);
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
	// XHR does not propagate stop requests to the channel notification callback
	if (notification)
	{
		nsCOMPtr<nsIDOMEventListener> domlistener(do_QueryInterface(notification));
		if (domlistener)
		{
			target->AddEventListener(NS_LITERAL_STRING("load"), domlistener, PR_FALSE);
			target->AddEventListener(NS_LITERAL_STRING("error"), domlistener, PR_FALSE);
		}
	}

	mInserting = insert;
	rv = mRequest->Send(nsnull);
	if (NS_FAILED(rv)) {
		return rv;
	}

	return rv;
}

NS_IMETHODIMP
danbooruTagHistoryService::GetRowCount(PRUint32 *aRowCount)
{
	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	if(!gTagHistoryEnabled)
		return NS_ERROR_NOT_AVAILABLE;

	PRBool row;
	mRowCountStmt->ExecuteStep(&row);
	if (row)
	{
		PRInt32 type;
		mRowCountStmt->GetTypeOfIndex(0, &type);
		if (type == mozIStorageValueArray::VALUE_TYPE_NULL)
			*aRowCount = 0;
		else
			mRowCountStmt->GetInt32(0, (PRInt32 *)aRowCount);
		mRowCountStmt->Reset();
	} else {
		return NS_ERROR_FAILURE;
	}
	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::GetMaxID(PRUint32 *aRowCount)
{
	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	if(!gTagHistoryEnabled)
		return NS_ERROR_NOT_AVAILABLE;

	PRBool row;
	mMaxIDStmt->ExecuteStep(&row);
	if (row)
	{
		PRInt32 type;
		mMaxIDStmt->GetTypeOfIndex(0, &type);
		if (type == mozIStorageValueArray::VALUE_TYPE_NULL)
			*aRowCount = 0;
		else
			mMaxIDStmt->GetInt32(0, (PRInt32 *)aRowCount);
		mMaxIDStmt->Reset();
	} else {
		return NS_ERROR_FAILURE;
	}

	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::GetEntryAt(PRUint32 aIndex, nsAString &aName, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruTagHistoryService::GetNameAt(PRUint32 aIndex, nsAString &aName)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruTagHistoryService::GetValueAt(PRUint32 aIndex, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruTagHistoryService::AddEntry(const nsAString &aName, const nsAString &aID, const PRInt32 aValue)
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
danbooruTagHistoryService::AddNameEntry(const nsAString &aName, const nsAString &aID )
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
danbooruTagHistoryService::RemoveEntryAt(PRUint32 index)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruTagHistoryService::EntryExists(const nsAString &aName, const PRInt32 aValue, PRBool *_retval)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruTagHistoryService::NameExists(const nsAString &aName, PRBool *_retval)
{
	NS_ENSURE_ARG_POINTER(_retval);
	mExistsStmt->BindStringParameter(0, aName);
	*_retval = PR_FALSE;
	nsresult rv = mExistsStmt->ExecuteStep(_retval);
	mExistsStmt->Reset();

	NS_ENSURE_SUCCESS(rv, rv);

	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::RemoveEntriesForName(const nsAString &aName)
{
	return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruTagHistoryService::RemoveAllEntries()
{
	if(!gTagHistoryEnabled)
		return NS_ERROR_NOT_AVAILABLE;

	// or we could just drop the database
	mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kRemoveAll));

	nsresult rv;
	nsCOMPtr<nsIObserverService> service(do_GetService("@mozilla.org/observer-service;1", &rv));
	if (NS_FAILED(rv))
		return rv;

	if (service)
		service->NotifyObservers(nsnull, "danbooru-clear-done", nsnull);

	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::IncrementValueForName(const nsAString &aName, PRBool *retval)
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
danbooruTagHistoryService::Observe(nsISupports *aSubject, const char *aTopic, const PRUnichar *aData)
{
	if (!strcmp(aTopic, NS_PREFBRANCH_PREFCHANGE_TOPIC_ID)) {
		mPrefBranch->GetIntPref(PREF_DANBOORUUP_AC_LIMIT, &gSearchLimit);
		mPrefBranch->GetBoolPref(PREF_DANBOORUUP_AC_ALTSEARCH, &gAltSearch);
	} else if (!strcmp(aTopic, DANBOORUPROCESSTAGS_TOPIC)){
		StartTagProcessing();
	}

	return NS_OK;
}

////////////////////////////////////////////////////////////////////////
//// nsIFormSubmitObserver
#if 0
NS_IMETHODIMP
danbooruTagHistoryService::Notify(nsIContent* aFormNode, nsIDOMWindowInternal* aWindow, nsIURI* aActionURL, PRBool* aCancelSubmit)
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
      nsString type;
      inputElt->GetType(type);
      if (type.EqualsIgnoreCase(textString)) {
        // If this input has a name/id and value, add it to the database
        nsString value;
        inputElt->GetValue(value);
        if (!value.IsEmpty()) {
          nsString name;
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

void
danbooruTagHistoryService::ReportDBError()
{
	nsCString err;
	mDB->GetLastErrorString(err);

	nsCOMPtr<nsIConsoleService> mConsole = do_GetService("@mozilla.org/consoleservice;1");
	mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(err).get());

	NS_ERROR(err.get());
}

nsresult
danbooruTagHistoryService::OpenDatabase()
{
	if (mDB)
		return NS_OK;

	gTagHistoryEnabled = PR_FALSE;

	nsresult rv;
	nsCOMPtr<mozIStorageService> storage(do_GetService(MOZ_STORAGE_SERVICE_CONTRACTID, &rv));
	if (NS_FAILED(rv))
		return rv;

	// Get a handle to the database file
	nsCOMPtr <nsIFile> historyFile;
	rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(historyFile));
	if(NS_FAILED(rv))
	{
		// probably using xpcshell
		rv = NS_GetSpecialDirectory(NS_OS_CURRENT_WORKING_DIR, getter_AddRefs(historyFile));
		if (NS_FAILED(rv))
			return rv;
	}
	historyFile->Append(NS_ConvertUTF8toUTF16(kTagHistoryFileName));

	rv = storage->OpenDatabase(historyFile, getter_AddRefs(mDB));
	NS_ENSURE_SUCCESS(rv, rv);
	if (mDB == nsnull)
	{
		return NS_ERROR_FAILURE;
	}

	// silently fails if it already exists
	mDB->CreateTable(kTagTableName, kTagHistorySchema);

	if (NS_FAILED(mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTableIsV2))))
	{
		rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTableMigrateV1_V2));
		if (NS_FAILED(rv))
		{
			NS_ERROR("danbooruTagHistoryService: could not migrate schema from v1 to v2");
		}
	}

#define DU_ENSURE_SUCCESS 	if (NS_FAILED(rv))	\
				{	\
					ReportDBError();	\
					mDB->RollbackTransaction();	\
					return rv;	\
				}

	// check for old schema
	// done every time, but no way to see the schema from the storage interface, so
	nsCOMPtr<mozIStorageStatement> constraintCheckStmt;

	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTableHasNoValueConstraintCheck2), getter_AddRefs(constraintCheckStmt));
	DU_ENSURE_SUCCESS;

	// create a test row and see if value is null
	rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTableHasNoValueConstraintCheck1));
	DU_ENSURE_SUCCESS;

	PRInt32 nullCount = 0;
	PRBool row = PR_FALSE;
	constraintCheckStmt->ExecuteStep(&row);
	if(row)
	{
		constraintCheckStmt->GetInt32(0, &nullCount);
	} else {
		// no row?
		nsCString err;
		mDB->GetLastErrorString(err);
		err.Insert(NS_LITERAL_CSTRING("no row returned by null constraint check? "), 0);
		NS_ERROR(err.get());
	}
	// remove test row
	constraintCheckStmt->Reset();
	rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kTableHasNoValueConstraintCheck3));
	DU_ENSURE_SUCCESS;

	if(nullCount > 0)	// value has no not null constraint
	{
		mDB->BeginTransaction();
		// delete duplicates (wasn't there always a unique constraint? whatever)
		rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kDeleteDuplicateNames));
		DU_ENSURE_SUCCESS;
		// temp storage for tags
		rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kCreateTempTagTable));
		DU_ENSURE_SUCCESS;
		// fill temp table up, fixing null values along the way
		rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kCopyData));
		DU_ENSURE_SUCCESS;
		// recreate with new schema
		rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kDropOldTable));
		DU_ENSURE_SUCCESS;
		rv = mDB->CreateTable(kTagTableName, kTagHistorySchema);
		DU_ENSURE_SUCCESS;
		// put data back
		rv = mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kRepopulateNewTable));
		DU_ENSURE_SUCCESS;
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kDropTempTagTable));
		mDB->CommitTransaction();
		mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING("VACUUM"));
	}

	AttachRelatedTagDatabase();
	mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kCreateTempTagTable));

	// create statements for regular use
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagInsert), getter_AddRefs(mInsertStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagUpdateType), getter_AddRefs(mUpdateTypeStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagRemoveByID), getter_AddRefs(mRemoveByIDStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagIncrement), getter_AddRefs(mIncrementStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagSearch), getter_AddRefs(mSearchStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagSearchAlt), getter_AddRefs(mSearchAltStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagExists), getter_AddRefs(mExistsStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTagIDForName), getter_AddRefs(mIDForNameStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kMaxID), getter_AddRefs(mMaxIDStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kRowCount), getter_AddRefs(mRowCountStmt));
	DU_ENSURE_SUCCESS;
	rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kTempTagInsert), getter_AddRefs(mTempInsertStmt));
	DU_ENSURE_SUCCESS;

	// all clear
	gTagHistoryEnabled = PR_TRUE;

	return NS_OK;
}

// attach related tags DB if it exists
nsresult
danbooruTagHistoryService::AttachRelatedTagDatabase()
{
	if (mRelatedTagsAvailable)
		return NS_OK;

	if (!mDB)
	{
		return OpenDatabase();
	}

	nsCOMPtr <nsIFile> relatedFile;
	nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(relatedFile));
	if(NS_FAILED(rv))
	{
		rv = NS_GetSpecialDirectory(NS_OS_CURRENT_WORKING_DIR, getter_AddRefs(relatedFile));
		NS_ENSURE_SUCCESS(rv, rv);
	}
	relatedFile->Append(NS_ConvertUTF8toUTF16(kRelTagFileName));
	PRBool retval = PR_FALSE;
	rv = relatedFile->Exists(&retval);
	if(NS_SUCCEEDED(rv) && retval)
	{
		nsCOMPtr<mozIStorageStatement> attachStmt;
		rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kAttachRTDB), getter_AddRefs(attachStmt));
		DU_ENSURE_SUCCESS;

		nsString path;
		relatedFile->GetPath(path);
		attachStmt->BindStringParameter(0, path);
		attachStmt->Execute();
		PRInt32 err;
		mDB->GetLastError(&err);
		if(err)
			rv = NS_ERROR_FAILURE;
		else
			rv = NS_OK;
		//TODO: figure out what can actually go wrong
		DU_ENSURE_SUCCESS;

		rv = mDB->CreateStatement(NS_LITERAL_CSTRING(kRelTagSearch), getter_AddRefs(mRelSearchStmt));
		DU_ENSURE_SUCCESS;

		mRelatedTagsAvailable = PR_TRUE;
	}

	return NS_OK;
}
#undef DU_ENSURE_SUCCESS

NS_IMETHODIMP
danbooruTagHistoryService::DetachRelatedTagDatabase()
{
	mRelatedTagsAvailable = PR_FALSE;
	if (mDB == nsnull) return NS_OK;
	mDB->ExecuteSimpleSQL(NS_LITERAL_CSTRING(kDetachRTDB));
	return NS_OK;
}

nsresult
danbooruTagHistoryService::CloseDatabase()
{
	mInsertStmt = nsnull;
	mUpdateTypeStmt = nsnull;
	mRemoveByIDStmt = nsnull;
	mIncrementStmt = nsnull;
	mSearchStmt = nsnull;
	mSearchAltStmt = nsnull;
	mExistsStmt = nsnull;
	mIDForNameStmt = nsnull;
	mMaxIDStmt = nsnull;
	mRowCountStmt = nsnull;
	mRelSearchStmt = nsnull;
	mTempInsertStmt = nsnull;

	mDB = nsnull;
	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::AutoCompleteSearch(const nsAString &aInputName,
                                  danbooruIAutoCompleteArrayResult *aPrevResult,
                                  nsIAutoCompleteResult **aResult)
{
	if (!TagHistoryEnabled())
		return NS_OK;
	if (mNodeList)
		return NS_OK;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	nsCOMPtr<danbooruIAutoCompleteArrayResult> result;
	// not so great performance-wise to re-search every time a wildcard is present, but the alternative is too much trouble
	if (aPrevResult && (FindChar(aInputName, '*') == -1) && !gAltSearch) {
		result = aPrevResult;

		PRUint32 rowCount;
		result->GetMatchCount(&rowCount);
		for (PRInt32 i = rowCount-1; i >= 0; --i) {
			nsString name;
			result->GetValueAt(i, name);

			if(name.Length() < aInputName.Length())
			{
				result->RemoveValueAt(i, PR_FALSE);
				continue;
			}

			nsDependentSubstring sub = Substring(name, 0, aInputName.Length());

#if defined(DANBOORUUP_TESTING) || defined(DEBUG)
		 	//PR_fprintf(PR_STDERR, "%s %s%s\n", NS_ConvertUTF16toUTF8(aInputName).get(), NS_ConvertUTF16toUTF8(name).get(), aInputName.Equals(sub, CaseInsensitiveCompare) ? " ***" : "");
#endif

#ifdef MOZILLA_1_8_BRANCH
			if (!Equals(aInputName, sub, CaseInsensitiveCompare))
#else
			if (!aInputName.Equals(sub, CaseInsensitiveCompare))
#endif
				result->RemoveValueAt(i, PR_FALSE);
		}
	} else {
		result = do_CreateInstance(DANBOORU_AUTOCOMPLETEARRAYRESULT_CONTRACTID);

		if (result == nsnull) // nande da yo
			return NS_ERROR_FAILURE;

		result->SetSearchString(aInputName);

		nsCOMPtr<mozIStorageStatement> searchStmt = mSearchStmt;
		PRBool row;
		nsString name, likeInputName;
		PRUint32 type;
		NS_StringCopy(likeInputName, aInputName);
		// insert wildcards for alternate search first
		if(gAltSearch) {
			PRUint32 length = aInputName.Length();
			searchStmt = mSearchAltStmt;
			for (PRInt32 i = length; i>=0; i--) {
				likeInputName.Insert(NS_LITERAL_STRING("*"),i);
			}
#ifdef DEBUG
			PR_fprintf(PR_STDERR, "alt %s\n", NS_ConvertUTF16toUTF8(likeInputName).get());
#endif
		}
		// escape SQL wildcards first, and change * wildcard to SQL % wildcard
		ReplaceSubstring(likeInputName, NS_LITERAL_STRING("\\"), NS_LITERAL_STRING("\\\\"));
		ReplaceSubstring(likeInputName, NS_LITERAL_STRING("%"), NS_LITERAL_STRING("\\%"));
		ReplaceSubstring(likeInputName, NS_LITERAL_STRING("_"), NS_LITERAL_STRING("\\_"));
		ReplaceSubstring(likeInputName, NS_LITERAL_STRING("*"), NS_LITERAL_STRING("%"));
		if(FindChar(aInputName, '*') == -1) {
			likeInputName.Append(NS_LITERAL_STRING("%"));
		}

		searchStmt->BindStringParameter(0, likeInputName);
		searchStmt->BindInt32Parameter(1, gSearchLimit);
		searchStmt->ExecuteStep(&row);
		while (row)
		{
			name = searchStmt->AsSharedWString(0, nsnull);
			type = (PRUint32)searchStmt->AsInt32(1);
			result->AddRow(name, type);
			searchStmt->ExecuteStep(&row);
		}
		searchStmt->Reset();

		PRUint32 matchCount;
		result->GetMatchCount(&matchCount);
		if (matchCount > 0) {
#ifdef DEBUG
			PR_fprintf(PR_STDERR, "search %s matched %d\n", NS_ConvertUTF16toUTF8(aInputName).get(), matchCount);
#endif
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

NS_IMETHODIMP
danbooruTagHistoryService::SearchTags(const nsAString &aInputName,
					const PRInt32 aLimit,
					danbooruIAutoCompleteArrayResult **_retval)
{
	NS_ENSURE_ARG_POINTER(_retval);
	*_retval = nsnull;

	nsresult rv = OpenDatabase();
	NS_ENSURE_SUCCESS(rv, rv);

	PRBool row;

	danbooruIAutoCompleteArrayResult *result = new danbooruAutoCompleteArrayResult;
	nsCOMPtr<mozIStorageStatement> searchStmt;

	if (gAltSearch) {
		searchStmt = mSearchAltStmt;
	} else {
		searchStmt = mSearchStmt;
	}

	searchStmt->BindStringParameter(0, aInputName);
	searchStmt->BindInt32Parameter(1, aLimit);
	searchStmt->ExecuteStep(&row);

	nsString name;
	PRUint32 type;
	while (row)
	{
		name = searchStmt->AsSharedWString(0, nsnull);
		type = (PRUint32)searchStmt->AsInt32(1);

		result->AddRow(name, type);
		searchStmt->ExecuteStep(&row);
	}
	searchStmt->Reset();

	PRUint32 matchCount;
	result->GetMatchCount(&matchCount);
	if (matchCount > 0) {
		result->SetSearchResult(nsIAutoCompleteResult::RESULT_SUCCESS);
		result->SetDefaultIndex(0);
	} else {
		result->SetSearchResult(nsIAutoCompleteResult::RESULT_NOMATCH);
		result->SetDefaultIndex(-1);
	}

	NS_ADDREF(*_retval = result);
	return NS_OK;
}

NS_IMETHODIMP
danbooruTagHistoryService::SearchRelatedTags(const nsAString &aInputName,
					danbooruIAutoCompleteArrayResult **_retval)
{
	NS_ENSURE_ARG_POINTER(_retval);
	*_retval = nsnull;

	nsresult rv = OpenDatabase();
	NS_ENSURE_SUCCESS(rv, rv);

	rv = AttachRelatedTagDatabase();
	NS_ENSURE_SUCCESS(rv, rv);

	if (!mRelatedTagsAvailable)
	{
		return NS_ERROR_NOT_AVAILABLE;
	}

	PRBool row;
	PRUint32 id;
	PRBool isnull = PR_FALSE;

	danbooruIAutoCompleteArrayResult *result = new danbooruAutoCompleteArrayResult;

	mIDForNameStmt->BindStringParameter(0, aInputName);
	mIDForNameStmt->ExecuteStep(&row);
	if (row)
	{
		mIDForNameStmt->GetIsNull(0, &isnull);
		if (!isnull)
			id = (PRUint32)mIDForNameStmt->AsInt32(0);
	}
	mIDForNameStmt->Reset();
	if (!row || isnull) {
		result->SetSearchResult(nsIAutoCompleteResult::RESULT_FAILURE);
		result->SetDefaultIndex(-1);
		NS_ADDREF(*_retval = result);
		return NS_OK;
	}

#ifdef DEBUG
	PR_fprintf(PR_STDERR, "related %s = %d\n", NS_ConvertUTF16toUTF8(aInputName).get(), id);
#endif

	nsString name;
	PRUint32 type;
	mRelSearchStmt->BindInt32Parameter(0, id);
	mRelSearchStmt->ExecuteStep(&row);
	while (row)
	{
		name = mRelSearchStmt->AsSharedWString(0, nsnull);
		type = (PRUint32)mRelSearchStmt->AsInt32(1);
		result->AddRow(name, type);
		mRelSearchStmt->ExecuteStep(&row);

#ifdef DEBUG
		PR_fprintf(PR_STDERR, "\t%s %d\n", NS_ConvertUTF16toUTF8(name).get(), type);
#endif
	}
	mRelSearchStmt->Reset();

	PRUint32 matchCount;
	result->GetMatchCount(&matchCount);
	if (matchCount > 0) {
		result->SetSearchResult(nsIAutoCompleteResult::RESULT_SUCCESS);
		result->SetDefaultIndex(0);
	} else {
		result->SetSearchResult(nsIAutoCompleteResult::RESULT_NOMATCH);
		result->SetDefaultIndex(-1);
	}

	NS_ADDREF(*_retval = result);
	return NS_OK;
}

