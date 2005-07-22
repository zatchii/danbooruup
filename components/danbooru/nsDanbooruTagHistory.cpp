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
#include "nsMorkCID.h"
#include "nsIMdbFactoryFactory.h"
#include "nsQuickSort.h"
#include "nsCRT.h"
#include "nsString.h"
#include "nsIConsoleService.h"
#include "nsPrintfCString.h"
#include "nsUnicharUtils.h"
#include "nsReadableUtils.h"
//#include "nsIContent.h"
//#include "nsIDOMNode.h"
//#include "nsIDOMHTMLFormElement.h"
//#include "nsIDOMHTMLInputElement.h"
//#include "nsIDOMHTMLCollection.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIPrefBranch2.h"
#include "nsVoidArray.h"
#include "nsCOMArray.h"

#define PREF_FORMFILL_BRANCH "extensions.danbooruUp.autocomplete."
#define PREF_FORMFILL_ENABLE "enable"

static const char *kTagHistoryFileName = "danbooruhistory.dat";

NS_INTERFACE_MAP_BEGIN(nsDanbooruTagHistory)
  NS_INTERFACE_MAP_ENTRY(nsIDanbooruTagHistory)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIObserver)
NS_INTERFACE_MAP_END_THREADSAFE

NS_IMPL_THREADSAFE_ADDREF(nsDanbooruTagHistory)
NS_IMPL_THREADSAFE_RELEASE(nsDanbooruTagHistory)

mdb_column nsDanbooruTagHistory::kToken_NameColumn = 0;
mdb_column nsDanbooruTagHistory::kToken_ValueColumn = 0;

#ifdef DANBOORUUP_TESTING
PRBool nsDanbooruTagHistory::gTagHistoryEnabled = PR_TRUE;
PRBool nsDanbooruTagHistory::gPrefsInitialized = PR_TRUE;
#else
PRBool nsDanbooruTagHistory::gTagHistoryEnabled = PR_FALSE;
PRBool nsDanbooruTagHistory::gPrefsInitialized = PR_FALSE;
#endif

nsDanbooruTagHistory::nsDanbooruTagHistory() :
  mEnv(nsnull),
  mStore(nsnull),
  mTable(nsnull)
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

NS_IMETHODIMP
nsDanbooruTagHistory::GetRowCount(PRUint32 *aRowCount)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  mdb_err err = mTable->GetCount(mEnv, aRowCount);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetEntryAt(PRUint32 aIndex, nsAString &aName, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->PosToRow(mEnv, aIndex, getter_AddRefs(row));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  GetRowValue(row, kToken_NameColumn, aName);
  GetRowValue(row, kToken_ValueColumn, aValue);

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetNameAt(PRUint32 aIndex, nsAString &aName)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->PosToRow(mEnv, aIndex, getter_AddRefs(row));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  GetRowValue(row, kToken_NameColumn, aName);

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::GetValueAt(PRUint32 aIndex, PRInt32 *aValue)
{
  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMdbRow> row;
  mdb_err err = mTable->PosToRow(mEnv, aIndex, getter_AddRefs(row));
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);

  GetRowValue(row, kToken_ValueColumn, aValue);

  return NS_OK;
}

NS_IMETHODIMP
nsDanbooruTagHistory::AddEntry(const nsAString &aName, const PRInt32 aValue)
{
  if (!TagHistoryEnabled())
    return NS_OK;

  nsresult rv = OpenDatabase(); // lazily ensure that the database is open
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMdbRow> row;
  AppendRow(aName, aValue, getter_AddRefs(row));
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
  return EntriesExistInternal(&aName, aValue, _retval);
}

NS_IMETHODIMP
nsDanbooruTagHistory::NameExists(const nsAString &aName, PRBool *_retval)
{
  return EntriesExistInternal(&aName, nsnull, _retval);
}

NS_IMETHODIMP
nsDanbooruTagHistory::RemoveEntriesForName(const nsAString &aName)
{
  return RemoveEntriesInternal(&aName);
}

NS_IMETHODIMP
nsDanbooruTagHistory::RemoveAllEntries()
{
  nsresult rv = RemoveEntriesInternal(nsnull);

  rv |= Flush();

  return rv;
}

NS_IMETHODIMP
nsDanbooruTagHistory::IncrementValueForName(const nsAString &aName, PRInt32 *retval)
{
	if(aName.IsEmpty())
		return NS_ERROR_INVALID_ARG;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

	mdb_err err;
	mdb_count count;
	nsAutoString name;
	PRInt32 value;
	err = mTable->GetCount(mEnv, &count);
	if (err != 0) return NS_ERROR_FAILURE;

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

	return NS_OK;
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
  printf("mork error yarn: %p\n", inYarn);
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
  printf("mork warning yarn: %p\n", inYarn);
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
  printf("mork abort yarn: %p\n", inYarn);
  return NS_OK;
}

nsresult
nsDanbooruTagHistory::OpenDatabase()
{
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

  /* // TESTING: Add a row to the database
  nsAutoString foopy;
  foopy.AssignWithConversion("foopy");
  nsAutoString oogly;
  oogly.AssignWithConversion("oogly");
  AppendRow(foopy, oogly, nsnull);
  Flush(); */

  /* // TESTING: Dump the contents of the database
  PRUint32 count = 0;
  mdb_err err = mTable->GetCount(mEnv, &count);
  printf("%d rows in form history\n", count);

  for (mdb_pos pos = count - 1; pos >= 0; --pos) {
    nsCOMPtr<nsIMdbRow> row;
    err = mTable->PosToRow(mEnv, pos, getter_AddRefs(row));

    nsAutoString name;
    GetRowValue(row, kToken_NameColumn, name);
    nsAutoString value;
    GetRowValue(row, kToken_ValueColumn, value);
    printf("ROW: %s - %s\n", ToNewCString(name), ToNewCString(value));
  } */

  return NS_OK;
}

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
nsDanbooruTagHistory::CloseDatabase()
{
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

  return NS_OK;
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
    mdb_err err = mTable->NewRow(mEnv, &rowId, getter_AddRefs(newRow));
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
nsDanbooruTagHistory::SetRowValue(nsIMdbRow *aRow, mdb_column aCol, const nsAString &aValue)
{
	PRInt32 len = aValue.Length() * sizeof(PRUnichar);

	mdbYarn yarn = {(void *)ToNewUnicode(aValue), len, len, 0, 0, nsnull};
	mdb_err err = aRow->AddColumn(mEnv, aCol, &yarn);

	return err ? NS_ERROR_FAILURE : NS_OK;
}

	nsresult
nsDanbooruTagHistory::SetRowValue(nsIMdbRow *aRow, mdb_column aCol, const PRInt32 aValue)
{
	nsCAutoString buf; buf.AppendInt(aValue);

	mdbYarn yarn = { (void *)buf.get(), buf.Length(), buf.Length(), 0, 0, nsnull };
	mdb_err err = aRow->AddColumn(mEnv, aCol, &yarn);

	return err ? NS_ERROR_FAILURE : NS_OK;
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

nsresult
nsDanbooruTagHistory::AutoCompleteSearch(const nsAString &aInputName,
                                  nsIAutoCompleteMdbResult *aPrevResult,
                                  nsIAutoCompleteResult **aResult)
{
	if (!TagHistoryEnabled())
		return NS_OK;

	nsresult rv = OpenDatabase(); // lazily ensure that the database is open
	NS_ENSURE_SUCCESS(rv, rv);

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
		do {
			rowCursor->NextRow(mEnv, getter_AddRefs(row), &pos);
			if (!row)
				break;

			PRInt32 value = 0; // We will own the allocated string value
			nsAutoString name;
			if (RowMatch(row, aInputName, &value)) {
				matchingRows.AppendObject(row);
				GetRowValue(row, kToken_NameColumn, name);
				matchingValues.AppendElement(new nsString(name));
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
				NS_Free(matchingValues[i]);
			}

			delete[] items;
		}

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

int PR_CALLBACK
nsDanbooruTagHistory::SortComparison(const void *v1, const void *v2, void *closureVoid)
{
	PRUint32 *index1 = (PRUint32 *)v1;
	PRUint32 *index2 = (PRUint32 *)v2;
	nsAutoVoidArray *array = (nsAutoVoidArray *)closureVoid;

	nsString *s1 = (nsString *)array->ElementAt(2 * *index1);
	nsString *s2 = (nsString *)array->ElementAt(2 * *index2);
	PRInt32 n1 = (PRInt32)array->ElementAt(1 + 2 * *index1);
	PRInt32 n2 = (PRInt32)array->ElementAt(1 + 2 * *index2);

	if (n1 == n2)
		return Compare(*s1, *s2, nsCaseInsensitiveStringComparator());
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
	if (Compare(Substring(name, 0, aInputName.Length()), aInputName, nsCaseInsensitiveStringComparator()) == 0) {
#ifdef DEBUG
	fprintf(stderr, "************************* MATCH *************************\n");
#endif
		if (aValue) {
			PRInt32 value;
			GetRowValue(aRow, kToken_ValueColumn, &value);
			*aValue = value;
		}
		return PR_TRUE;
	}

	return PR_FALSE;
}


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
