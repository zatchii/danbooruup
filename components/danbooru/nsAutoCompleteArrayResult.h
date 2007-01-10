#ifndef __nsAutoCompleteArrayResult__
#define __nsAutoCompleteArrayResult__

#include "nsIAutoCompleteResult.h"
//#include "nsIAutoCompleteResultTypes.h"
#include "nsIAutoCompleteArrayResult.h"
#include "nsString.h"
#include "nsVoidArray.h"

// {683D9ABF-BFDE-4c93-9D96-7181865B1257}
#define NS_AUTOCOMPLETEARRAYRESULT_CID \
{ 0x683d9abf, 0xbfde, 0x4c93, { 0x9d, 0x96, 0x71, 0x81, 0x86, 0x5b, 0x12, 0x57 } }
#define NS_AUTOCOMPLETEARRAYRESULT_CONTRACTID "@mozilla.org/autocomplete/array-result;1"

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

	nsAutoString mSearchString;
	nsAutoString mErrorDescription;
	PRInt32 mDefaultIndex;
	PRUint32 mSearchResult;
};

#endif

