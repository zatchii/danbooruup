#include "danbooruAutoCompleteController.h"
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


// don't have the real class, so this seems to be impossible
//NS_IMPL_ISUPPORTS_INHERITED0(danbooruAutoCompleteController, nsIAutoCompleteController)


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
	return mController->GetValueAt(aIndex, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetCommentAt(PRInt32 aIndex, nsAString & _retval)
{
	return mController->GetCommentAt(aIndex, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetStyleAt(PRInt32 aIndex, nsAString & _retval)
{
	return mController->GetStyleAt(aIndex, _retval);
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

NS_IMETHODIMP
danbooruAutoCompleteController::GetRowCount(PRInt32 *aRowCount)
{
	return mTreeView->GetRowCount(aRowCount);
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
	return mTreeView->GetCellText(row, col, _retval);
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsContainer(PRInt32 index, PRBool *_retval)
{
	char q[256];
	PR_snprintf(q, 256, "iscontainer %d", index);
	mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
	*_retval = PR_TRUE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::IsContainerOpen(PRInt32 index, PRBool *_retval)
{
	//NS_NOTREACHED("no container cells");
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
	char q[256];
	PR_snprintf(q, 256, "getlevel %d", index);
	mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
	*_retval = 0;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::GetParentIndex(PRInt32 rowIndex, PRInt32 *_retval)
{
	*_retval = 0;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::HasNextSibling(PRInt32 rowIndex, PRInt32 afterIndex, PRBool *_retval)
{
	*_retval = PR_FALSE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::ToggleOpenState(PRInt32 index)
{
	char q[256];
	PR_snprintf(q, 256, "openstate %d", index);
	mConsole->LogStringMessage(NS_ConvertUTF8toUTF16(q).get());
	nsCOMPtr<nsISound> sound(do_CreateInstance("@mozilla.org/sound;1"));
	sound->Beep();
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteController::SetTree(nsITreeBoxObject *tree)
{
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

