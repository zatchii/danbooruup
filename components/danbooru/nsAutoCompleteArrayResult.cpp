#include "nsAutoCompleteArrayResult.h"
#include "nsCOMPtr.h"
#include "nsCRT.h"
#include "prprf.h"

NS_INTERFACE_MAP_BEGIN(nsAutoCompleteArrayResult)
  NS_INTERFACE_MAP_ENTRY(nsIAutoCompleteResult)
  NS_INTERFACE_MAP_ENTRY(nsIAutoCompleteArrayResult)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIAutoCompleteResult)
NS_INTERFACE_MAP_END

NS_IMPL_ADDREF(nsAutoCompleteArrayResult)
NS_IMPL_RELEASE(nsAutoCompleteArrayResult)

nsAutoCompleteArrayResult::nsAutoCompleteArrayResult() :
  mDefaultIndex(-1),
  mSearchResult(nsIAutoCompleteResult::RESULT_IGNORED)
{
}

nsAutoCompleteArrayResult::~nsAutoCompleteArrayResult()
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
nsAutoCompleteArrayResult::GetSearchString(nsAString &aSearchString)
{
  aSearchString = mSearchString;
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetSearchResult(PRUint16 *aSearchResult)
{
  *aSearchResult = mSearchResult;
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetDefaultIndex(PRInt32 *aDefaultIndex)
{
  *aDefaultIndex = mDefaultIndex;
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetErrorDescription(nsAString & aErrorDescription)
{
  aErrorDescription = mErrorDescription;
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetMatchCount(PRUint32 *aMatchCount)
{
  *aMatchCount = mResults.Count();
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetValueAt(PRInt32 aIndex, nsAString & _retval)
{
 	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	_retval.Assign((PRUnichar*)mResults[aIndex]);

	return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetCommentAt(PRInt32 aIndex, nsAString & _retval)
{
	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::GetStyleAt(PRInt32 aIndex, nsAString & _retval)
{
	NS_ENSURE_TRUE(aIndex >= 0 && aIndex < mResults.Count(), NS_ERROR_ILLEGAL_VALUE);

	char tstyle[64];
	PR_snprintf(tstyle, sizeof(tstyle)/sizeof(char), "danbooru-tag-type-%d", mTypes[aIndex]);

	NS_CStringToUTF16(nsDependentCString(tstyle), NS_CSTRING_ENCODING_ASCII, _retval);

	return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::RemoveValueAt(PRInt32 aRowIndex, PRBool aRemoveFromDb)
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
nsAutoCompleteArrayResult::SetSearchString(const nsAString &aSearchString)
{
  mSearchString.Assign(aSearchString);
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::SetErrorDescription(const nsAString &aErrorDescription)
{
  mErrorDescription.Assign(aErrorDescription);
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::SetDefaultIndex(PRInt32 aDefaultIndex)
{
  mDefaultIndex = aDefaultIndex;
  return NS_OK;
}

NS_IMETHODIMP
nsAutoCompleteArrayResult::SetSearchResult(PRUint16 aSearchResult)
{
  mSearchResult = aSearchResult;
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteArrayResult

NS_IMETHODIMP
nsAutoCompleteArrayResult::AddRow(const nsAString &aName, const PRUint32 aType)
{
	mResults.AppendElement(NS_StringCloneData(aName));
	mTypes.AppendElement(aType);
	return NS_OK;
}

