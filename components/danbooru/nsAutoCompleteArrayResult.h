#ifndef __nsAutoCompleteArrayResult__
#define __nsAutoCompleteArrayResult__

#include "nsIAutoCompleteResult.h"
//#include "nsIAutoCompleteResultTypes.h"
#include "nsIAutoCompleteArrayResult.h"
#include "nsStringAPI.h"
// workaround for old branch nsVoidArray not using frozen API
#ifdef MOZILLA_1_8_BRANCH
#define nsAString_h___
#endif
#include "nsVoidArray.h"
#ifdef MOZILLA_1_8_BRANCH
#undef nsAString_h___
#endif
#include "nsTArray.h"

// {683D9ABF-BFDE-4c93-9D96-7181865B1257}
#define NS_AUTOCOMPLETEARRAYRESULT_CID \
{ 0x683d9abf, 0xbfde, 0x4c93, { 0x9d, 0x96, 0x71, 0x81, 0x86, 0x5b, 0x12, 0x58 } }
#define NS_AUTOCOMPLETEARRAYRESULT_CONTRACTID "@unbuffered.info/autocomplete/array-result;1"

class nsAutoCompleteArrayResult : public nsIAutoCompleteArrayResult
{
public:
	NS_DECL_ISUPPORTS
	NS_DECL_NSIAUTOCOMPLETERESULT

	nsAutoCompleteArrayResult();
	virtual ~nsAutoCompleteArrayResult();

	NS_DECL_NSIAUTOCOMPLETEARRAYRESULT

protected:
	nsAutoVoidArray mResults;
	nsTArray<PRUint32> mTypes;

	nsString mSearchString;
	nsString mErrorDescription;
	PRInt32 mDefaultIndex;
	PRUint32 mSearchResult;
};

#endif

