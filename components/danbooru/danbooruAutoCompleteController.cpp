#include "danbooruAutoCompleteController.h"
#include "danbooruITagHistoryService.h"
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

//#include "/mingw/work/mozilla/toolkit/components/autocomplete/src/nsAutoCompleteController.h"


#ifdef MOZILLA_1_8_BRANCH
NS_IMPL_ISUPPORTS7(danbooruAutoCompleteController, danbooruIAutoCompleteController,
                                                   nsIAutoCompleteController,
                                                   nsIAutoCompleteController_MOZILLA_1_8_BRANCH,
						   nsIAutoCompleteObserver,
						   nsIRollupListener,
						   nsITimerCallback,
						   nsITreeView)
#else
NS_IMPL_ISUPPORTS6(danbooruAutoCompleteController, danbooruIAutoCompleteController,
                                                   nsIAutoCompleteController,
						   nsIAutoCompleteObserver,
						   nsIRollupListener,
						   nsITimerCallback,
						   nsITreeView)
#endif

PR_STATIC_CALLBACK(PLDHashOperator)
hashReleaseEnum(nsUint32HashKey::KeyType aKey, danbooruIAutoCompleteArrayResult *&aData, void* userArg)
{
	NS_RELEASE(aData);

	return PL_DHASH_NEXT;
}

danbooruAutoCompleteController::danbooruAutoCompleteController()
{
	mController = do_CreateInstance(NS_AUTOCOMPLETECONTROLLER_CONTRACTID);
	mRollup = do_QueryInterface(mController);
	mTimer = do_QueryInterface(mController);
	mTreeView = do_QueryInterface(mController);
	nsresult rv;
	mConsole = do_GetService("@mozilla.org/consoleservice;1", &rv);
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
	return mController->GetMatchCount(aMatchCount);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetInput(nsIAutoCompleteInput **aInput)
{
	return mController->GetInput(aInput);
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetInput(nsIAutoCompleteInput *aInput)
{
	return mController->SetInput(aInput);
}

NS_IMETHODIMP
danbooruAutoCompleteController::StartSearch(const nsAString &aSearchString)
{ 
	return mController->StartSearch(aSearchString);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleText(PRBool aIgnoreSelection)
{
	return mController->HandleText(aIgnoreSelection);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleEnter(PRBool *_retval)
{
	return mController->HandleEnter(_retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::HandleEscape(PRBool *_retval)
{
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

NS_IMETHODIMP
danbooruAutoCompleteController::HandleKeyNavigation(PRUint16 aKey, PRBool *_retval)
{
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
	mRelatedHash.Get(idx, &result);

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
		return mController->GetCommentAt(aIndex, _retval);
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(idx, &result);

	PRUint16 searchResult;
	result->GetSearchResult(&searchResult);

	if (searchResult == nsIAutoCompleteResult::RESULT_SUCCESS)
	{
		aIndex -= idx + 1;
		return result->GetCommentAt(aIndex, _retval);
	} else {
		return NS_ERROR_FAILURE;
	}
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetStyleAt(PRInt32 aIndex, nsAString & _retval)
{
	PRInt32 idx;
	GetParentIndex(aIndex, &idx);
	if(idx == -1)
		return mController->GetStyleAt(aIndex, _retval);
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(idx, &result);

	aIndex -= idx + 1;
	return result->GetStyleAt(aIndex, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetSearchString(const nsAString &aSearchString)
{ 
	return mController->SetSearchString(aSearchString);
}

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

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteObserver

NS_IMETHODIMP
danbooruAutoCompleteController::OnSearchResult(nsIAutoCompleteSearch *aSearch, nsIAutoCompleteResult* aResult)
{
	return mObserver->OnSearchResult(aSearch, aResult);
}

////////////////////////////////////////////////////////////////////////
//// nsIRollupListener

NS_IMETHODIMP
danbooruAutoCompleteController::Rollup()
{
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

////////////////////////////////////////////////////////////////////////
//// nsITimerCallback

NS_IMETHODIMP
danbooruAutoCompleteController::Notify(nsITimer *timer)
{
	return mTimer->Notify(timer);
}

////////////////////////////////////////////////////////////////////////
// nsITreeView

// helper function to subtract open second-level rows above the given row to get the real index
// assumes that index is actually a first-level row
PRUint32
danbooruAutoCompleteController::FirstLevelRowIndex(PRInt32 index)
{
	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	PRUint32 otherIndex = index;
	PRUint32 count;
	for(PRUint32 i=0; i<mRelatedKeys.Length(); i++)
	{
		if (mRelatedKeys[i] > (PRUint32)index) break;
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
		if (!open) continue;
		result->GetMatchCount(&count);
		otherIndex -= count;
	}
	return otherIndex;
}

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
	return mTreeView->GetRowProperties(index, properties);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCellProperties(PRInt32 row, nsITreeColumn* col, nsISupportsArray* properties)
{
	return mTreeView->GetCellProperties(row, col, properties);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetColumnProperties(nsITreeColumn* col, nsISupportsArray* properties)
{
	return mTreeView->GetColumnProperties(col, properties);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetImageSrc(PRInt32 row, nsITreeColumn* col, nsAString& _retval)
{
	return mTreeView->GetImageSrc(row, col, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetProgressMode(PRInt32 row, nsITreeColumn* col, PRInt32* _retval)
{
	return mTreeView->GetProgressMode(row, col, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCellValue(PRInt32 row, nsITreeColumn* col, nsAString& _retval)
{  
	return mTreeView->GetCellValue(row, col, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCellText(PRInt32 row, nsITreeColumn* col, nsAString& _retval)
{
	PRInt32 idx;
	GetParentIndex(row, &idx);
	if(idx == -1)
		return mTreeView->GetCellText(FirstLevelRowIndex(row), col, _retval);
	danbooruIAutoCompleteArrayResult *result;
	mRelatedHash.Get(idx, &result);

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
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsContainer(PRInt32 index, PRBool *_retval)
{
	char q[256];
	PR_snprintf(q, 256, "iscontainer %d", index);
	mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());

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
	//NS_NOTREACHED("no container cells");
	*_retval = PR_FALSE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetLevel(PRInt32 index, PRInt32 *_retval)
{
	{
		char q[256];
		PR_snprintf(q, 256, "getlevel %d", index);
		mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
	}

	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	PRUint32 count;
	*_retval = 0;
	for(PRUint32 i=0; i<mRelatedKeys.Length(); i++)
	{
		if (mRelatedKeys[i] >= (PRUint32)index) break;
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
		if (!open) continue;
		result->GetMatchCount(&count);
		if((PRUint32)index <= mRelatedKeys[i] + count)
		{
			*_retval = 1;
			break;
		}
	}

	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetParentIndex(PRInt32 rowIndex, PRInt32 *_retval)
{
	danbooruIAutoCompleteArrayResult *result;
	PRBool open;
	PRUint32 count;

	*_retval = -1;
	for(PRUint32 i=0; i<mRelatedKeys.Length(); i++)
	{
		if (mRelatedKeys[i] >= (PRUint32)rowIndex) break;
		mRelatedHash.Get(mRelatedKeys[i], &result);
		result->GetOpen(&open);
		if (!open) continue;
		result->GetMatchCount(&count);
		if((PRUint32)rowIndex <= mRelatedKeys[i] + count)
		{
			*_retval = mRelatedKeys[i];
			break;
		}
	}
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::HasNextSibling(PRInt32 rowIndex, PRInt32 afterIndex, PRBool *_retval)
{
	PRBool container;
	IsContainer(afterIndex, &container);
	if (container)
		*_retval = PR_FALSE;
	else
		*_retval = PR_TRUE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::ToggleOpenState(PRInt32 index)
{
	{
		char q[256];
		PR_snprintf(q, 256, "openstate %d", index);
		mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
		nsCOMPtr<nsISound> sound(do_CreateInstance("@mozilla.org/sound;1"));
		sound->Beep();
	}

	PRInt32 level;
	PRInt32 otherIndex;
	PRUint32 count;
	PRBool open;
	danbooruIAutoCompleteArrayResult *result;

	// second-level toggles are the simplest case
	GetLevel(index, &level);
	if(level)
	{
		// since we support only one level, toggling while in second level collapses that level
		GetParentIndex(index, &otherIndex);
		if (mRelatedHash.Get(otherIndex, &result))
		{
			result->ToggleOpen();
			result->GetMatchCount(&count);
			mTree->RowCountChanged(otherIndex+1, -((PRInt32)count));
		} else {
			NS_NOTREACHED("row level > 0 with no corresponding parent row in hash??");
		}
		return NS_OK;
	}

	otherIndex = FirstLevelRowIndex(index);
	
	// at top level, see if we need to make a new search result
	if(mRelatedHash.Get(otherIndex, &result))
	{
		result->ToggleOpen();
		result->GetMatchCount(&count);
		result->GetOpen(&open);
		if(open)
			mTree->RowCountChanged(index + 1, count);
		else
			mTree->RowCountChanged(index + 1, -((PRInt32)count));
	} else {
		// new search
		nsCOMPtr<danbooruITagHistoryService> tagservice;
		nsString tag;
		GetValueAt(otherIndex, tag);
		tagservice->SearchRelatedTags(tag, &result);
		result->SetIndex(otherIndex);

		mRelatedKeys.AppendElement(otherIndex);
		mRelatedKeys.Sort();
		mRelatedHash.Put(otherIndex, result);

		result->SetOpen(PR_TRUE);
		result->GetMatchCount(&count);
		mTree->RowCountChanged(index + 1, count);
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

