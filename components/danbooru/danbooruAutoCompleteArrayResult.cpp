#include "danbooruAutoCompleteArrayResult.h"
#include "nsCOMPtr.h"
#include "nsCRT.h"
#include "prprf.h"

NS_INTERFACE_MAP_BEGIN(danbooruAutoCompleteArrayResult)
  NS_INTERFACE_MAP_ENTRY(nsIAutoCompleteResult)
  NS_INTERFACE_MAP_ENTRY(danbooruIAutoCompleteArrayResult)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIAutoCompleteResult)
NS_INTERFACE_MAP_END

NS_IMPL_ADDREF(danbooruAutoCompleteArrayResult)
NS_IMPL_RELEASE(danbooruAutoCompleteArrayResult)

danbooruAutoCompleteArrayResult::danbooruAutoCompleteArrayResult() :
  mDefaultIndex(-1),
  mSearchResult(nsIAutoCompleteResult::RESULT_IGNORED),
  mOpen(PR_FALSE)
{
}

danbooruAutoCompleteArrayResult::~danbooruAutoCompleteArrayResult()
{
	PRInt32 i;
	for (i=0; i<mResults.Count(); i++)
		NS_Free(mResults[i]);
	mResults.Clear();
	mTypes.Clear();
}

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteResult

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetSearchString(nsAString &aSearchString)
{
  aSearchString = mSearchString;
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetSearchResult(PRUint16 *aSearchResult)
{
  *aSearchResult = mSearchResult;
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetDefaultIndex(PRInt32 *aDefaultIndex)
{
  *aDefaultIndex = mDefaultIndex;
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetErrorDescription(nsAString & aErrorDescription)
{
  aErrorDescription = mErrorDescription;
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetMatchCount(PRUint32 *aMatchCount)
{
  *aMatchCount = mResults.Count();
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetValueAt(PRInt32 aIndex, nsAString & _retval)
{
 	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	_retval.Assign((PRUnichar*)mResults[aIndex]);

	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetCommentAt(PRInt32 aIndex, nsAString & _retval)
{
	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetImageAt(PRInt32 aIndex, nsAString & _retval)
{
	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetStyleAt(PRInt32 aIndex, nsAString & _retval)
{
	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	char tstyle[64];
	PR_snprintf(tstyle, sizeof(tstyle)/sizeof(char), "danbooru-tag-type-%d", mTypes[aIndex]);

	NS_CStringToUTF16(nsDependentCString(tstyle), NS_CSTRING_ENCODING_ASCII, _retval);

	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::RemoveValueAt(PRInt32 aRowIndex, PRBool aRemoveFromDb)
{
	NS_ENSURE_TRUE(aRowIndex >= 0 && aRowIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	//if (aRemoveFromDb)
	//{
	//	return NS_ERROR_NOT_IMPLEMENTED;
	//}

	NS_Free(mResults[aRowIndex]);
	if (!mResults.RemoveElementAt(aRowIndex))
		return NS_ERROR_FAILURE;
	mTypes.RemoveElementAt(aRowIndex);

	return NS_OK;
}

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteBaseResult

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::SetSearchString(const nsAString &aSearchString)
{
  mSearchString.Assign(aSearchString);
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::SetErrorDescription(const nsAString &aErrorDescription)
{
  mErrorDescription.Assign(aErrorDescription);
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::SetDefaultIndex(PRInt32 aDefaultIndex)
{
  mDefaultIndex = aDefaultIndex;
  return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::SetSearchResult(PRUint16 aSearchResult)
{
  mSearchResult = aSearchResult;
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////
//// danbooruIAutoCompleteArrayResult

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::AddRow(const nsAString &aName, const PRUint32 aType)
{
	mResults.AppendElement(NS_StringCloneData(aName));
	mTypes.AppendElement(aType);
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::SetOpen(PRBool aOpen)
{
	mOpen = aOpen;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetOpen(PRBool *_retval)
{
	NS_ENSURE_ARG_POINTER(_retval);
	*_retval = mOpen;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::ToggleOpen()
{
	if(mOpen) mOpen = PR_FALSE;
	else mOpen = PR_TRUE;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::SetIndex(PRUint32 aIndex)
{
	mIndex = aIndex;
	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoCompleteArrayResult::GetIndex(PRUint32 *_retval)
{
	NS_ENSURE_ARG_POINTER(_retval);
	*_retval = mIndex;
	return NS_OK;
}

