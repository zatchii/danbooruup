#ifndef __danbooruAutoCompleteArrayResult__
#define __danbooruAutoCompleteArrayResult__

#include "nsIAutoCompleteResult.h"
#include "danbooruIAutoCompleteArrayResult.h"
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

#define DANBOORU_AUTOCOMPLETEARRAYRESULT_CID \
{ 0x683d9abf, 0xbfde, 0x4c93, { 0x9d, 0x96, 0x71, 0x81, 0x86, 0x5b, 0x12, 0x58 } }
#define DANBOORU_AUTOCOMPLETEARRAYRESULT_CONTRACTID "@unbuffered.info/autocomplete/array-result;1"

class danbooruAutoCompleteArrayResult : public danbooruIAutoCompleteArrayResult
{
public:
	NS_DECL_ISUPPORTS
	NS_DECL_NSIAUTOCOMPLETERESULT

	danbooruAutoCompleteArrayResult();
	virtual ~danbooruAutoCompleteArrayResult();

	NS_DECL_DANBOORUIAUTOCOMPLETEARRAYRESULT

protected:
	nsAutoVoidArray mResults;
	nsTArray<PRUint32> mTypes;

	nsString mSearchString;
	nsString mErrorDescription;
	PRInt32 mDefaultIndex;
	PRUint32 mSearchResult;
};

#endif

