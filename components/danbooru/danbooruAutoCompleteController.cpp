// -*- c-basic-offset: 8 -*-
#include "danbooruAutoCompleteController.h"
#include "danbooruIAutoCompletePopup.h"
#include "danbooruITagHistoryService.h"
#include "danbooruTagHistoryService.h"
#include "nsIAutoCompletePopup.h"
// bypass inclusion of internal string API
#ifdef MOZILLA_1_8_BRANCH
#define nsAString_h___
#endif
#include "nsIAtomService.h"
#ifdef MOZILLA_1_8_BRANCH
#undef nsAString_h___
#endif

#include "nsIDOMKeyEvent.h"
#include "nsIObserverService.h"
#include "nsITreeColumns.h"
#include "nsToolkitCompsCID.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsStringAPI.h"
#include "nspr.h"

#include "nsISound.h"

#ifdef MOZILLA_1_8_BRANCH
#define nsString_h___
#include "nsICaseConversion.h"
#include "nsUnicharUtilCIID.h"
#undef nsString_h___
#else
#include "nsUnicharUtils.h"
#endif

#ifdef MOZILLA_1_8_BRANCH
NS_IMPL_ISUPPORTS7(danbooruAutoCompleteController, danbooruIAutoCompleteController,
						   nsIAutoCompleteController,
						   nsIAutoCompleteController_MOZILLA_1_8_BRANCH,
						   nsIAutoCompleteObserver,
						   nsIRollupListener,
						   nsITimerCallback,
						   nsITreeView)
#else
NS_IMPL_ISUPPORTS5(danbooruAutoCompleteController, danbooruIAutoCompleteController,
						   nsIAutoCompleteController,
						   nsIAutoCompleteObserver,
						   nsITimerCallback,
						   nsITreeView)
#endif

danbooruAutoCompleteController::danbooruAutoCompleteController()
{
	mController = do_CreateInstance(NS_AUTOCOMPLETECONTROLLER_CONTRACTID);
#ifdef MOZILLA_1_8_BRANCH
	mRollup = do_QueryInterface(mController);
#endif
	mTimer = do_QueryInterface(mController);
	mTreeView = do_QueryInterface(mController);
	mRelatedHash.Init();

	mConsole = do_GetService("@mozilla.org/consoleservice;1");
}

PR_STATIC_CALLBACK(PLDHashOperator)
hashReleaseEnum(nsUint32HashKey::KeyType aKey, danbooruIAutoCompleteArrayResult *&aData, void* userArg)
{
	NS_RELEASE(aData);

	return PL_DHASH_REMOVE;
}

danbooruAutoCompleteController::~danbooruAutoCompleteController()
{
	mRelatedHash.Enumerate(&hashReleaseEnum, nsnull);
}

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteController

NS_IMETHODIMP
danbooruAutoCompleteController::GetSearchStatus(PRUint16 *aSearchStatus)
{
	return mController->GetSearchStatus(aSearchStatus);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetMatchCount(PRUint32 *aMatchCount)
{
	// richlistbox wants this, but does it break treeview compatibility?
	return GetRowCount((PRInt32*)aMatchCount);
	//return mController->GetMatchCount(aMatchCount);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetInput(nsIAutoCompleteInput **aInput)
{
	return mController->GetInput(aInput);
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetInput(nsIAutoCompleteInput *aInput)
{
	if(mInput != aInput)
	{
		mInput = aInput;
		ClearRelated();
	}
	return mController->SetInput(aInput);
}

NS_IMETHODIMP
danbooruAutoCompleteController::StartSearch(const nsAString &aSearchString)
{
	mSearchString = aSearchString;

	return mController->StartSearch(aSearchString);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleText(PRBool aIgnoreSelection)
{
	if (mInput)
	{
		nsString newValue;
		mInput->GetTextValue(newValue);
#ifdef DEBUG
	{
		nsString text;
		PRUint32 rc;
		PRInt32 start, end;
		PR_fprintf(PR_STDERR, "handletext new\t%s\n\told %s\n", NS_ConvertUTF16toUTF8(newValue).get(), NS_ConvertUTF16toUTF8(mSearchString).get());
		mController->GetMatchCount(&rc);
		nsCOMPtr<nsIAutoCompleteInput> input(mInput);
		input->GetSelectionStart(&start);
		input->GetSelectionEnd(&end);
		PR_fprintf(PR_STDERR, "\tmInput %d\tmController rowCount %d\n\tstart %d end %d len %d\n", mInput != nsnull, rc, start, end, newValue.IsEmpty()?-1:newValue.Length());
	}
#endif
		// always void the tree arrays
		ClearRelated();
		mSearchString = newValue;
	}
	return mController->HandleText(aIgnoreSelection);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleEnter(PRBool aIsPopupSelection, PRBool *_retval)
{
	*_retval = PR_FALSE;
	if (!mInput)
		return NS_OK;

	// allow the event through unless there is something selected in the popup
	mInput->GetPopupOpen(_retval);
	nsCOMPtr<nsIAutoCompletePopup> popup;
	mInput->GetPopup(getter_AddRefs(popup));

	if (*_retval) {
		if (popup) {
			PRInt32 selectedIndex;
			popup->GetSelectedIndex(&selectedIndex);
			*_retval = selectedIndex >= 0;
			if (FirstLevelRowIndex(selectedIndex) != selectedIndex) {
#ifdef DEBUG
			{
				nsString text;
				GetValueAt(selectedIndex, text);
				PR_fprintf(PR_STDERR, "handleenter sub\t%d %s\n", selectedIndex, NS_ConvertUTF16toUTF8(text).get());
			}
#endif
				EnterMatch(aIsPopupSelection);
				return NS_OK;
			}
		}
	}

#ifdef DEBUG
	{
		nsString text;
		PRInt32 selectedIndex;
		popup->GetSelectedIndex(&selectedIndex);
		GetValueAt(selectedIndex, text);
		PR_fprintf(PR_STDERR, "handleenter \t%d (%d) %s\n", selectedIndex, FirstLevelRowIndex(selectedIndex), NS_ConvertUTF16toUTF8(text).get());
	}
#endif

	nsCOMPtr<danbooruIAutoCompletePopup> dpopup( do_QueryInterface(popup) );
	dpopup->SetIndexHack(PR_TRUE);
	mController->HandleEnter(aIsPopupSelection, _retval);
	dpopup->SetIndexHack(PR_FALSE);

	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleEscape(PRBool *_retval)
{
	if (mInput)
		ClearRelated();
	return mController->HandleEscape(_retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleStartComposition()
{
	return mController->HandleStartComposition();
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleEndComposition()
{
	return mController->HandleEndComposition();
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleTab()
{
	return mController->HandleTab();
}

#ifdef MOZILLA_1_8_BRANCH
NS_IMETHODIMP
danbooruAutoCompleteController::HandleKeyNavigation(PRUint16 aKey, PRBool *_retval)
#else
NS_IMETHODIMP
danbooruAutoCompleteController::HandleKeyNavigation(PRUint32 aKey, PRBool *_retval)
#endif
{
	// need to intercept left, right and home keys which complete
	*_retval = PR_FALSE;
	if (!mInput)
		return NS_OK;

	nsCOMPtr<nsIAutoCompletePopup> popup;
	mInput->GetPopup(getter_AddRefs(popup));
	NS_ENSURE_TRUE(popup != nsnull, NS_ERROR_FAILURE);

	PRBool disabled;
	mInput->GetDisableAutoComplete(&disabled);
	NS_ENSURE_TRUE(!disabled, NS_OK);

	// doesn't handle completeSelectedIndex, but we don't use that for danbooru AC
#ifdef MOZILLA_1_8_BRANCH
	if (   aKey == nsIAutoCompleteController::KEY_LEFT
	    || aKey == nsIAutoCompleteController::KEY_RIGHT
#ifndef XP_MACOSX
	    || aKey == nsIAutoCompleteController::KEY_HOME
#endif
	    )
#else // !defined(MOZILLA_1_8_BRANCH)
	if (   aKey == nsIDOMKeyEvent::DOM_VK_LEFT
	    || aKey == nsIDOMKeyEvent::DOM_VK_RIGHT
#ifndef XP_MACOSX
	    || aKey == nsIDOMKeyEvent::DOM_VK_HOME
#endif
	   )
#endif
	{
		// The user hit a text-navigation key.
		PRBool isOpen;
		mInput->GetPopupOpen(&isOpen);
		if (isOpen) {
			PRInt32 selectedIndex;
			popup->GetSelectedIndex(&selectedIndex);
			if (selectedIndex >= 0) {
				// The pop-up is open and has a selection, take its value
				nsString value;
				if (NS_SUCCEEDED(GetValueAt(selectedIndex, value))) {
					mInput->SetTextValue(value);
					mInput->SelectTextRange(value.Length(), value.Length());
				}
			}
			// Close the pop-up even if nothing was selected
			ClosePopup();
		}
		// Update last-searched string to the current input, since the input may
		// have changed.  Without this, subsequent backspaces look like text
		// additions, not text deletions.
		nsString value;
		mInput->GetTextValue(value);
		SetSearchString(value);
		return NS_OK;
	}

	return mController->HandleKeyNavigation(aKey, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleDelete(PRBool *_retval)
{
	return mController->HandleDelete(_retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetValueAt(PRInt32 aIndex, nsAString & _retval)
{
	PRInt32 idx;
	GetParentIndex(aIndex, &idx);
	if(idx == -1)
		return mController->GetValueAt(FirstLevelRowIndex(aIndex), _retval);
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(FirstLevelRowIndex(idx), &result);

	PRUint16 searchResult;
	result->GetSearchResult(&searchResult);

	if (searchResult == nsIAutoCompleteResult::RESULT_SUCCESS)
	{
		aIndex -= idx + 1;
		return result->GetValueAt(aIndex, _retval);
	} else {
		return NS_ERROR_FAILURE;
	}
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCommentAt(PRInt32 aIndex, nsAString & _retval)
{
	PRInt32 idx;
	GetParentIndex(aIndex, &idx);
	if(idx == -1)
		_retval.Assign(NS_LITERAL_STRING("false"));
	else
		_retval.Assign(NS_LITERAL_STRING("true"));
	return NS_OK;
#if 0
	if(idx == -1)
		return mController->GetCommentAt(aIndex, _retval);
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(FirstLevelRowIndex(idx), &result);

	PRUint16 searchResult;
	result->GetSearchResult(&searchResult);

	if (searchResult == nsIAutoCompleteResult::RESULT_SUCCESS)
	{
		aIndex -= idx + 1;
		return result->GetCommentAt(aIndex, _retval);
	} else {
		return NS_ERROR_FAILURE;
	}
#endif
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetStyleAt(PRInt32 aIndex, nsAString & _retval)
{
	PRInt32 idx;
	GetParentIndex(aIndex, &idx);
	if(idx == -1)
	{
		mController->GetStyleAt(aIndex, _retval);
#ifdef DEBUG
	{
		nsString text;
		GetValueAt(aIndex, text);
		PR_fprintf(PR_STDERR, "styleat\t%d %s\t%s\n", aIndex, NS_ConvertUTF16toUTF8(text).get(), NS_ConvertUTF16toUTF8(_retval).get());
	}
#endif
		return NS_OK;
	}
	danbooruIAutoCompleteArrayResult *result;

	aIndex -= idx + 1;
	mRelatedHash.Get(FirstLevelRowIndex(idx), &result);
	result->GetStyleAt(aIndex, _retval);
#ifdef DEBUG
	{
		nsString text;
		GetValueAt(aIndex, text);
		PR_fprintf(PR_STDERR, "styleat sub\t%d %s\t%s\n", aIndex, NS_ConvertUTF16toUTF8(text).get(), NS_ConvertUTF16toUTF8(_retval).get());
	}
#endif
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetSearchString(const nsAString &aSearchString)
{
	return mController->SetSearchString(aSearchString);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetSearchString(nsAString &aSearchString)
{
	return mController->GetSearchString(aSearchString);
}

#ifdef MOZILLA_1_8_BRANCH
// nsIAutoCompleteController_MOZILLA_1_8_BRANCH
NS_IMETHODIMP
danbooruAutoCompleteController::AttachRollupListener()
{
	return mController->AttachRollupListener();
}

NS_IMETHODIMP
danbooruAutoCompleteController::DetachRollupListener()
{
	return mController->DetachRollupListener();
}
#else
// 1.9 functions
NS_IMETHODIMP
danbooruAutoCompleteController::StopSearch()
{
	return mController->StopSearch();
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetImageAt(PRInt32 aIndex, nsAString & _retval)
{
	PRInt32 idx;
	GetParentIndex(aIndex, &idx);
	if(idx == -1)
	{
		mController->GetImageAt(aIndex, _retval);
#ifdef DEBUG
	{
		nsString text;
		GetValueAt(aIndex, text);
		PR_fprintf(PR_STDERR, "imageat\t%d %s\t%s\n", aIndex, NS_ConvertUTF16toUTF8(text).get(), NS_ConvertUTF16toUTF8(_retval).get());
	}
#endif
		return NS_OK;
	}
	danbooruIAutoCompleteArrayResult *result;

	aIndex -= idx + 1;
	mRelatedHash.Get(FirstLevelRowIndex(idx), &result);
	result->GetImageAt(aIndex, _retval);
#ifdef DEBUG
	{
		nsString text;
		GetValueAt(aIndex, text);
		PR_fprintf(PR_STDERR, "imageat sub\t%d %s\t%s\n", aIndex, NS_ConvertUTF16toUTF8(text).get(), NS_ConvertUTF16toUTF8(_retval).get());
	}
#endif
	return NS_OK;
}
#endif

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteObserver

NS_IMETHODIMP
danbooruAutoCompleteController::OnSearchResult(nsIAutoCompleteSearch *aSearch, nsIAutoCompleteResult* aResult)
{
	return mObserver->OnSearchResult(aSearch, aResult);
}

#ifdef MOZILLA_1_8_BRANCH
////////////////////////////////////////////////////////////////////////
//// nsIRollupListener

NS_IMETHODIMP
danbooruAutoCompleteController::Rollup()
{
	ClearRelated();
	return mRollup->Rollup();
}

NS_IMETHODIMP
danbooruAutoCompleteController::ShouldRollupOnMouseWheelEvent(PRBool *aShouldRollup)
{
	return mRollup->ShouldRollupOnMouseWheelEvent(aShouldRollup);
}

NS_IMETHODIMP
danbooruAutoCompleteController::ShouldRollupOnMouseActivate(PRBool *aShouldRollup)
{
	return mRollup->ShouldRollupOnMouseActivate(aShouldRollup);
}
#endif

////////////////////////////////////////////////////////////////////////
//// nsITimerCallback

NS_IMETHODIMP
danbooruAutoCompleteController::Notify(nsITimer *timer)
{
	return mTimer->Notify(timer);
}

////////////////////////////////////////////////////////////////////////
// nsITreeView

NS_IMETHODIMP
danbooruAutoCompleteController::GetRowCount(PRInt32 *aRowCount)
{
	PRInt32 count;
	PRUint32 sub;
	mTreeView->GetRowCount(&count);

	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	for(PRUint32 i=0; i<mRelatedKeys.Length(); i++)
	{
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
		if (!open) continue;
		result->GetMatchCount(&sub);
		count += sub;
	}

	*aRowCount = count;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetRowProperties(PRInt32 index, nsISupportsArray *properties)
{
	//not implemented on ns side
	return mTreeView->GetRowProperties(index, properties);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCellProperties(PRInt32 row, nsITreeColumn* col, nsISupportsArray* properties)
{
	PRInt32 idx;
	GetParentIndex(row, &idx);
	if(idx == -1)
	{
#ifdef DEBUG
	{
		nsString text;
		GetValueAt(row, text);
		PR_fprintf(PR_STDERR, "getcellprop %d %s\n", row, NS_ConvertUTF16toUTF8(text).get());
	}
#endif
		return mTreeView->GetCellProperties(FirstLevelRowIndex(row), col, properties);
	}
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(FirstLevelRowIndex(idx), &result);
#ifdef DEBUG
	{
		PRUint32 ct;
		result->GetMatchCount(&ct);
		PR_fprintf(PR_STDERR, "getcellprop %d got %d, %d entries\n", row, FirstLevelRowIndex(idx), ct);
	}
#endif

	row -= idx + 1;
#ifdef DEBUG
	{
		nsString text;
		result->GetValueAt(row, text);
		PR_fprintf(PR_STDERR, "getcellprop subrow %d %s\n", row, NS_ConvertUTF16toUTF8(text).get());
	}
#endif
	if (row >= 0) {
		nsString className;
		result->GetStyleAt(row, className);
		if (!className.IsEmpty()) {
			nsCOMPtr<nsIAtomService> atomSvc = do_GetService("@mozilla.org/atom-service;1");
			nsCOMPtr<nsIAtom> atom;
			atomSvc->GetAtom(className.get(), getter_AddRefs(atom));
			properties->AppendElement(atom);
		}
	}
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetColumnProperties(nsITreeColumn* col, nsISupportsArray* properties)
{
	return mTreeView->GetColumnProperties(col, properties);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetImageSrc(PRInt32 row, nsITreeColumn* col, nsAString& _retval)
{
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetProgressMode(PRInt32 row, nsITreeColumn* col, PRInt32* _retval)
{
	//notreached
	return NS_OK;
	//return mTreeView->GetProgressMode(row, col, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCellValue(PRInt32 row, nsITreeColumn* col, nsAString& _retval)
{
	//notreached
	return NS_OK;
	//return mTreeView->GetCellValue(row, col, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCellText(PRInt32 row, nsITreeColumn* col, nsAString& _retval)
{
	PRInt32 idx;
	GetParentIndex(row, &idx);
	if(idx == -1)
	{
		mTreeView->GetCellText(FirstLevelRowIndex(row), col, _retval);
#ifdef DEBUG
		{
		PR_fprintf(PR_STDERR, "celltext\t%d (%d)\t%s\n", row, FirstLevelRowIndex(row), NS_ConvertUTF16toUTF8(_retval).get());
		}
#endif
		return NS_OK;
	}
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(FirstLevelRowIndex(idx), &result);

	PRUint16 searchResult;
	result->GetSearchResult(&searchResult);

	if (searchResult == nsIAutoCompleteResult::RESULT_SUCCESS)
	{
		const PRUnichar* colID;
		col->GetIdConst(&colID);
		row -= idx + 1;
		if (NS_LITERAL_STRING("treecolAutoCompleteValue").Equals(nsString(colID)))
			result->GetValueAt(row, _retval);
		else if (NS_LITERAL_STRING("treecolAutoCompleteComment").Equals(nsString(colID)))
			result->GetCommentAt(row, _retval);
	}
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "celltext sub\t%d\t%s\n", row, NS_ConvertUTF16toUTF8(_retval).get());
	}
#endif
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsContainer(PRInt32 index, PRBool *_retval)
{
#if 0
	char q[256];
	PR_snprintf(q, 256, "iscontainer %d", index);
	mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
#endif

	PRInt32 level;
	GetLevel(index, &level);

	if(level)
		*_retval = PR_FALSE;
	else
		*_retval = PR_TRUE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsContainerOpen(PRInt32 index, PRBool *_retval)
{
	danbooruIAutoCompleteArrayResult *result;
	PRUint32 otherIndex = FirstLevelRowIndex(index);
	if (mRelatedHash.Get(otherIndex, &result))
		result->GetOpen(_retval);
	else
		*_retval = PR_FALSE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsContainerEmpty(PRInt32 index, PRBool *_retval)
{
	// we don't show the twisty in any case
	*_retval = PR_FALSE;
	return NS_OK;
}

void
danbooruAutoCompleteController::InitRowParents()
{
	if (mRowParents.IsEmpty())
	{
		PRInt32 count;
		mTreeView->GetRowCount(&count);
		mRowParents.SetCapacity(count);
		for (PRInt32 i=0; i<count; i++)
		{
			mRowParents.AppendElement(-1);
			mRootIndexes.AppendElement(i);
		}

		danbooruIAutoCompleteArrayResult *result;
		PRBool open;
		for(PRUint32 i=0, offset=0; i<mRelatedKeys.Length(); i++)
		{
			mRelatedHash.Get(mRelatedKeys[i], &result);
			result->GetOpen(&open);
			if (!open) continue;
			result->GetMatchCount((PRUint32*)&count);
			mRowParents.SetCapacity(mRowParents.Length() + count);
			for(PRUint32 j=0; j<(PRUint32)count; j++)
			{
				mRowParents.InsertElementAt(i+offset+1, i+offset);
				mRootIndexes.InsertElementAt(i+offset+1, -1);
			}
			offset += count;
		}
	}
}

void
danbooruAutoCompleteController::UpdateRowParents(PRInt32 parentIndex)
{
	PRBool open;
	PRUint32 count;
	danbooruIAutoCompleteArrayResult *result;

	mRelatedHash.Get(FirstLevelRowIndex(parentIndex), &result);
	result->GetOpen(&open);
	result->GetMatchCount(&count);

	if (open)
	{
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "opening parent %d (baseidx %d) +%d\n", parentIndex, FirstLevelRowIndex(parentIndex), count);
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex-1, mRowParents[parentIndex-1], FirstLevelRowIndex(parentIndex-1));
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex, mRowParents[parentIndex], FirstLevelRowIndex(parentIndex));
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex+1, mRowParents[parentIndex+1], FirstLevelRowIndex(parentIndex+1));
	}
#endif
		mRowParents.SetCapacity(mRowParents.Length() + count);
		for(PRUint32 j=0; j<count; j++)
		{
			mRowParents.InsertElementAt(parentIndex+1, parentIndex);
			mRootIndexes.InsertElementAt(parentIndex+1, -1);
		}
		// shift other parent entries
		for(PRUint32 j=parentIndex+count+1; j<mRowParents.Length(); j++)
		{
			if (mRowParents[j] == -1) continue;
			mRowParents[j] = mRowParents[j]+count;
		}
	} else {
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "closing parent %d (baseidx %d) -%d\n", parentIndex, FirstLevelRowIndex(parentIndex), count);
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex-1, mRowParents[parentIndex-1], FirstLevelRowIndex(parentIndex-1));
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex, mRowParents[parentIndex], FirstLevelRowIndex(parentIndex));
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex+1, mRowParents[parentIndex+1], FirstLevelRowIndex(parentIndex+1));
	}
#endif
		mRowParents.RemoveElementsAt(parentIndex+1, count);
		mRootIndexes.RemoveElementsAt(parentIndex+1, count);
		for(PRUint32 j=parentIndex+1; j<mRowParents.Length(); j++)
		{
			if (mRowParents[j] == -1) continue;
			mRowParents[j] = mRowParents[j]-count;
		}
	}
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex+count-1, mRowParents[parentIndex+count-1], FirstLevelRowIndex(parentIndex+count-1));
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex+count, mRowParents[parentIndex+count], FirstLevelRowIndex(parentIndex+count));
		PR_fprintf(PR_STDERR, "\t%d %d %d\n", parentIndex+count+1, mRowParents[parentIndex+count+1], FirstLevelRowIndex(parentIndex+count+1));
	}
#endif
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetLevel(PRInt32 index, PRInt32 *_retval)
{
#if 0
	{
		char q[256];
		PR_snprintf(q, 256, "getlevel %d", index);
		mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
	}
#endif
	InitRowParents();
	*_retval = (mRowParents[index] == -1) ? 0 : 1;
	return NS_OK;

	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	PRUint32 count;
	*_retval = 0;
	for(PRUint32 i=0, offset=0; i<mRelatedKeys.Length(); i++)
	{
		if (mRelatedKeys[i] + offset >= (PRUint32)index) break;
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
		if (!open) continue;
		result->GetMatchCount(&count);
		if((PRUint32)index <= offset + mRelatedKeys[i] + count)
		{
			*_retval = 1;
			break;
		}
		offset += count;
	}

	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetParentIndex(PRInt32 rowIndex, PRInt32 *_retval)
{
	InitRowParents();
	*_retval = mRowParents[rowIndex];
#if 0
	{
		PR_fprintf(PR_STDERR, "?   parent of %d (baseidx %d) is %d\n", rowIndex, mRootIndexes[rowIndex], mRowParents[rowIndex]);
	}
#endif
	return NS_OK;

	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	PRUint32 count;

	*_retval = -1;
	for(PRUint32 i=0, offset=0; i<mRelatedKeys.Length(); i++)
	{
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "?   parent %d (baseidx %d) + %d >= %d\n", i, mRelatedKeys[i], offset, rowIndex);
	}
#endif
		if (mRelatedKeys[i] + offset >= (PRUint32)rowIndex) break;
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "?   is open? %d\n", open);
	}
#endif
		if (!open) continue;
		result->GetMatchCount(&count);
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "?   opened with %d; %d <= %d ?\n", i, rowIndex, mRelatedKeys[i] + count);
	}
#endif
		if((PRUint32)rowIndex <= offset + mRelatedKeys[i] + count)
		{
			*_retval = mRelatedKeys[i] + offset;
			break;
		}
		offset += count;
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "?   offset now %d ?\n", offset);
	}
#endif
	}
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "    parent of %d is %d\n", rowIndex, *_retval);
	}
#endif
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::HasNextSibling(PRInt32 rowIndex, PRInt32 afterIndex, PRBool *_retval)
{
	InitRowParents();
	*_retval = (mRowParents[rowIndex+1] == -1) ? PR_FALSE : PR_TRUE;
	return NS_OK;

	PRBool container;
	IsContainer(rowIndex+1, &container);
	if (container)
		*_retval = PR_FALSE;
	else
		*_retval = PR_TRUE;
#ifdef DEBUG
	{
		nsString text;
		GetValueAt(rowIndex, text);
		PR_fprintf(PR_STDERR, "sibling %d %d\t%s\t%d\n", rowIndex, afterIndex, NS_ConvertUTF16toUTF8(text).get(), *_retval);
	}
#endif
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::ToggleOpenState(PRInt32 index)
{
	if (index < 0)
		return NS_OK;

#ifdef DEBUG
	{
		char q[256];
		PR_snprintf(q, 256, "openstate %d", index);
		PR_fprintf(PR_STDERR, "%s\n", q);
		mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
	}
#endif

	PRInt32 level;
	PRInt32 otherIndex;
	PRUint32 count;
	PRBool open;
	danbooruIAutoCompleteArrayResult *result;

	// second-level toggles are the simplest case
	GetLevel(index, &level);
	if(level)
	{
		// since we support only one level of depth, toggling while in second level collapses that level
		GetParentIndex(index, &otherIndex);
		if (mRelatedHash.Get(FirstLevelRowIndex(otherIndex), &result))
		{
			result->ToggleOpen();
			UpdateRowParents(otherIndex);
			result->GetMatchCount(&count);

			nsCOMPtr<nsIAutoCompletePopup> popup;
			mInput->GetPopup(getter_AddRefs(popup));

			if (mTree)
				mTree->RowCountChanged(otherIndex+1, -((PRInt32)count));
			else
				popup->Invalidate();
			// move the cursor to the parent
			NS_ENSURE_TRUE(popup != nsnull, NS_ERROR_FAILURE);
			popup->SetSelectedIndex(otherIndex);
		} else {
			NS_NOTREACHED("row level > 0 with no corresponding parent row in hash??");
		}
		return NS_OK;
	}

	otherIndex = FirstLevelRowIndex(index);

#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "\tfirstlevel index %d\n", otherIndex);
	}
#endif

	// at top level, see if we need to make a new search result
	if(mRelatedHash.Get(otherIndex, &result))
	{
		result->ToggleOpen();
		UpdateRowParents(index);
		result->GetMatchCount(&count);
		result->GetOpen(&open);
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "\texisting %d items now %s\n", count, open?"open":"closed");
	}
#endif
		if(mTree) {
			if(open)
				mTree->RowCountChanged(index + 1, count);
			else
				mTree->RowCountChanged(index + 1, -((PRInt32)count));
		} else {
			nsCOMPtr<nsIAutoCompletePopup> popup;
			mInput->GetPopup(getter_AddRefs(popup));
			popup->Invalidate();
		}
	} else {
		// new search
		nsresult rv;
		nsCOMPtr<danbooruITagHistoryService> tagservice = do_GetService(DANBOORU_TAGHISTORYSERVICE_CONTRACTID, &rv);
		NS_ENSURE_SUCCESS(rv, rv);

		nsString tag;
		GetValueAt(index, tag);
		rv = tagservice->SearchRelatedTags(tag, &result);
		if(NS_FAILED(rv)) {
			if (result)
				NS_RELEASE(result);
			nsCOMPtr<nsISound> sound(do_CreateInstance("@mozilla.org/sound;1"));
			sound->Beep();
			return NS_OK;
		}
		result->SetIndex(otherIndex);

		result->GetMatchCount(&count);
		if(count)
		{
			mRelatedKeys.AppendElement(otherIndex);
			mRelatedKeys.Sort();
			mRelatedHash.Put(otherIndex, result);

			result->SetOpen(PR_TRUE);
			UpdateRowParents(index);
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "\tadding %d items\n", count);
	}
#endif
			if(mTree) {
				mTree->RowCountChanged(index + 1, count);
			} else {
				nsCOMPtr<nsIAutoCompletePopup> popup;
				mInput->GetPopup(getter_AddRefs(popup));
				popup->Invalidate();
			}
		} else {
			if (result)
				NS_RELEASE(result);
			nsCOMPtr<nsISound> sound(do_CreateInstance("@mozilla.org/sound;1"));
			sound->Beep();
		}
	}
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetTree(nsITreeBoxObject *tree)
{
	mTree = tree;
	return mTreeView->SetTree(tree);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetSelection(nsITreeSelection * *aSelection)
{
	return mTreeView->GetSelection(aSelection);
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetSelection(nsITreeSelection * aSelection)
{
	return mTreeView->SetSelection(aSelection);
}

// the following are stubs in nsAutoCompleteController, but just wrap them anyway
NS_IMETHODIMP
danbooruAutoCompleteController::SelectionChanged()
{
	return mTreeView->SelectionChanged();
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetCellValue(PRInt32 row, nsITreeColumn* col, const nsAString& value)
{
	return mTreeView->SetCellValue(row, col, value);
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetCellText(PRInt32 row, nsITreeColumn* col, const nsAString& value)
{
	return mTreeView->SetCellText(row, col, value);
}

NS_IMETHODIMP
danbooruAutoCompleteController::CycleHeader(nsITreeColumn* col)
{
	return mTreeView->CycleHeader(col);
}

NS_IMETHODIMP
danbooruAutoCompleteController::CycleCell(PRInt32 row, nsITreeColumn* col)
{
	return mTreeView->CycleCell(row, col);
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsEditable(PRInt32 row, nsITreeColumn* col, PRBool *_retval)
{
	return mTreeView->IsEditable(row, col, _retval);
}

#ifndef MOZILLA_1_8_BRANCH
NS_IMETHODIMP
danbooruAutoCompleteController::IsSelectable(PRInt32 row, nsITreeColumn* col, PRBool *_retval)
{
	return mTreeView->IsSelectable(row, col, _retval);
}
#endif

NS_IMETHODIMP
danbooruAutoCompleteController::IsSeparator(PRInt32 index, PRBool *_retval)
{
	return mTreeView->IsSeparator(index, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsSorted(PRBool *_retval)
{
	return mTreeView->IsSorted(_retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::CanDrop(PRInt32 index, PRInt32 orientation, PRBool *_retval)
{
	return mTreeView->CanDrop(index, orientation, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::Drop(PRInt32 row, PRInt32 orientation)
{
	return mTreeView->Drop(row, orientation);
}

NS_IMETHODIMP
danbooruAutoCompleteController::PerformAction(const PRUnichar *action)
{
	return mTreeView->PerformAction(action);
}

NS_IMETHODIMP
danbooruAutoCompleteController::PerformActionOnRow(const PRUnichar *action, PRInt32 row)
{
	return mTreeView->PerformActionOnRow(action, row);
}

NS_IMETHODIMP
danbooruAutoCompleteController::PerformActionOnCell(const PRUnichar* action, PRInt32 row, nsITreeColumn* col)
{
	return mTreeView->PerformActionOnCell(action, row, col);
}

////////////////////////////////////////////////////////////////////////
// danbooruIAutoCompleteController

PR_STATIC_CALLBACK(PLDHashOperator)
hashCloseRelatedEnum(nsUint32HashKey::KeyType aKey, danbooruIAutoCompleteArrayResult *&aData, void* userArg)
{
	PRBool open;
	aData->GetOpen(&open);
	if (open)
	{
		PRUint32 count;
		aData->GetMatchCount(&count);
		aData->SetOpen(PR_FALSE);
		((nsITreeBoxObject*)userArg)->RowCountChanged(0, -((PRInt32)count));
	}
	return PL_DHASH_NEXT;
}

void danbooruAutoCompleteController::ClearRelated()
{
#ifdef DEBUG
	{
		PR_fprintf(PR_STDERR, "clearrelated rows %d hashes %d\n", mRowParents.Length(), mRelatedHash.Count());
	}
#endif
	// rowcount assert suppression
	if (mTree)
		mRelatedHash.Enumerate(&hashCloseRelatedEnum, ((nsITreeBoxObject*)mTree));
	mRelatedHash.Enumerate(&hashReleaseEnum, nsnull);
	mRelatedHash.Clear();
	mRelatedKeys.Clear();
	mRowParents.Clear();
	mRootIndexes.Clear();
}

// used by binding
NS_IMETHODIMP
danbooruAutoCompleteController::OriginalRowIndex(PRInt32 rowIndex, PRInt32 *_retval)
{
	*_retval = FirstLevelRowIndex(rowIndex);
	return NS_OK;
}

// helper function to subtract open second-level rows above the given row to get the real index
// assumes that index is actually a first-level row
PRInt32
danbooruAutoCompleteController::FirstLevelRowIndex(PRInt32 index)
{
	InitRowParents();
	return mRootIndexes[index];

	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	PRUint32 otherIndex = index;
	PRUint32 count;
	for(PRUint32 i=0; i<mRelatedKeys.Length(); i++)
	{
		if (mRelatedKeys[i] >= (PRUint32)otherIndex) break;
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
		if (!open) continue;
		result->GetMatchCount(&count);
		otherIndex -= count;
	}

	return otherIndex;
}

// unfortunately no way to avoid copying protected functions from nsAutoCompleteController since we can't inherit the real class
nsresult
danbooruAutoCompleteController::OpenPopup()
{
	PRUint32 minResults;
	PRInt32 rowCount;
	mInput->GetMinResultsForPopup(&minResults);

	GetRowCount(&rowCount);
	if (rowCount >= minResults) {
		//mIsOpen = PR_TRUE;
		return mInput->SetPopupOpen(PR_TRUE);
	}

	return NS_OK;
}

nsresult
danbooruAutoCompleteController::ClosePopup()
{
	if (!mInput) {
		return NS_OK;
	}

	PRBool isOpen;
	mInput->GetPopupOpen(&isOpen);
	if (!isOpen)
		return NS_OK;

	nsCOMPtr<nsIAutoCompletePopup> popup;
	mInput->GetPopup(getter_AddRefs(popup));
	NS_ENSURE_TRUE(popup != nsnull, NS_ERROR_FAILURE);
	popup->SetSelectedIndex(-1);
	//mIsOpen = PR_FALSE;
	return mInput->SetPopupOpen(PR_FALSE);
}

nsresult
danbooruAutoCompleteController::EnterMatch(PRBool aIsPopupSelection)
{
	nsCOMPtr<nsIAutoCompletePopup> popup;
	mInput->GetPopup(getter_AddRefs(popup));
	NS_ENSURE_TRUE(popup != nsnull, NS_ERROR_FAILURE);

	PRBool forceComplete;
	mInput->GetForceComplete(&forceComplete);

	// Ask the popup if it wants to enter a special value into the textbox
	nsString value;
	popup->GetOverrideValue(value);
	if (value.IsEmpty()) {
		// If a row is selected in the popup, enter it into the textbox
		PRInt32 selectedIndex;
		popup->GetSelectedIndex(&selectedIndex);
		if (selectedIndex >= 0 || aIsPopupSelection)
			GetValueAt(selectedIndex, value);
		// this can't happen since a related tag would have to be selected for us to be in this function at all
		// if (forceComplete && value.IsEmpty()) {}
	}

	nsCOMPtr<nsIObserverService> obsSvc = do_GetService("@mozilla.org/observer-service;1");
	NS_ENSURE_STATE(obsSvc);
	obsSvc->NotifyObservers(mInput, "autocomplete-will-enter-text", nsnull);

	if (!value.IsEmpty()) {
#ifdef DEBUG
	{
		PRInt32 selectedIndex;
		popup->GetSelectedIndex(&selectedIndex);
		nsString text;
		GetValueAt(selectedIndex, text);
		PR_fprintf(PR_STDERR, "entermatch using value\t%d %s\n", selectedIndex, NS_ConvertUTF16toUTF8(text).get());
	}
#endif
		mInput->SetTextValue(value);
		mInput->SelectTextRange(value.Length(), value.Length());
		mSearchString = value;
	}

	obsSvc->NotifyObservers(mInput, "autocomplete-did-enter-text", nsnull);
#ifdef MOZILLA_1_8_BRANCH
	Rollup();
#else
	ClosePopup();
#endif

	PRBool cancel;
	mInput->OnTextEntered(&cancel);

	return NS_OK;
}
