/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
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
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Pierre Phaneuf <pp@ludusdesign.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
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


/**
 *
 * A sample of XPConnect. This file contains an implementation nsSample
 * of the interface nsISample.
 *
 */
#include <stdio.h>

#include "danbooruAutoComplete.h"
#include "danbooruTagHistoryService.h"

#include "nsIXPConnect.h"
#include "nsStringAPI.h"

#include "nsIScriptSecurityManager.h"
#include "nsIPrincipal.h"
#include "nsIIOService.h"
#include "nsIXMLHttpRequest.h"
//#include "nsNetUtil.h"

#include "nsServiceManagerUtils.h"
#include "nsMemory.h"
#include "nspr.h"
#include "prthread.h"

#include "danbooruIAutoCompleteArrayResult.h"

////////////////////////////////////////////////////////////////////////

danbooruAutoComplete::danbooruAutoComplete()
{
}

danbooruAutoComplete::~danbooruAutoComplete()
{
}

NS_IMPL_ISUPPORTS2(danbooruAutoComplete, danbooruIAutoComplete, nsIAutoCompleteSearch)

////////////////////////////////////////////////////////////////////////
//// nsIAutoCompleteSearch

NS_IMETHODIMP
danbooruAutoComplete::StartSearch(const nsAString &aSearchString, const nsAString &aSearchParam,
					nsIAutoCompleteResult *aPreviousResult, nsIAutoCompleteObserver *aListener)
{
	NS_ENSURE_ARG_POINTER(aListener);
#if defined(DANBOORUUP_TESTING) || defined(DEBUG)
{
	//char *csearch = ToNewCString(aSearchString);
	//char *cparam = ToNewCString(aSearchParam);
	NS_NAMED_LITERAL_STRING(a,"searching ");
	NS_NAMED_LITERAL_STRING(b," - ");
	nsString bob;
	const PRUnichar *z;
	bob = a;
	bob += aSearchString;
	bob += b;
	bob += aSearchParam;
	NS_StringGetData(bob, &z);
	PR_fprintf(PR_STDERR, "%s\n", NS_ConvertUTF16toUTF8(z).get());
	//nsMemory::Free(z);
	//nsMemory::Free(cparam);
}
#endif

	nsCOMPtr<nsIAutoCompleteResult> result;
	//nsCOMPtr<nsIAutoCompleteArrayResult> pResult = do_QueryInterface(aPreviousResult);

	danbooruTagHistoryService *history = danbooruTagHistoryService::GetInstance();
	if (history) {
		nsresult rv = history->AutoCompleteSearch(aSearchString,
				NS_STATIC_CAST(danbooruIAutoCompleteArrayResult *,
					aPreviousResult),
				getter_AddRefs(result));

		NS_ENSURE_SUCCESS(rv, rv);
		NS_RELEASE(history);
	}
	aListener->OnSearchResult(this, result);

	return NS_OK;
}

NS_IMETHODIMP
danbooruAutoComplete::StopSearch()
{
#if defined(DANBOORUUP_TESTING) || defined(DEBUG)
	fprintf(stderr, "danbooruAutoComplete::StopSearch()\n");
#endif
	return NS_OK;
}

