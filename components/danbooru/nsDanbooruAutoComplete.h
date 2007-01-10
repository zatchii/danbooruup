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
 * A sample of XPConnect. This file is the header of an implementation
 * nsSample of the nsISample interface.
 *
 */

#include "nsIDanbooruAutoComplete.h"
#include "nsIAutoCompleteSearch.h"

#ifdef DANBOORUUP_SELF_AUTOCOMPLETECONTROLLER
#include "nsIAutoCompleteController.h"
#include "nsIAutoCompleteInput.h"
#include "nsIAutoCompletePopup.h"
//#include "nsIAutoCompleteResultTypes.h"
#include "nsCOMPtr.h"
#include "nsISupportsArray.h"
#include "nsITimer.h"
#include "nsITreeBoxObject.h"
#include "nsITreeView.h"
#endif

/**
 * SampleImpl is an implementation of the nsISample interface.  In XPCOM,
 * there can be more than one implementation of an given interface.  Class
 * IDs (CIDs) uniquely identify a particular implementation of an interface.
 * Interface IDs (IIDs) uniquely identify an interface.
 *
 * The CID is also a unique number that looks just like an IID
 * and uniquely identifies an implementation
 * {7CB5B7A0-07D7-11d3-BDE2-000064657374}
 */

#define NS_DANBOORUAC_CID \
{ 0x6ed74ba6, 0x620f, 0x4ca8, { 0xa3, 0xc1, 0xea, 0x4f, 0xbc, 0x12, 0xdd, 0xc4 } }
#define NS_DANBOORUAC_CONTRACTID "@mozilla.org/autocomplete/search;1?name=danboorutag"

class nsDanbooruAutoComplete : public nsIDanbooruAutoComplete,
#ifdef DANBOORUUP_SELF_AUTOCOMPLETECONTROLLER
                               public nsIAutoCompleteController,
                               public nsIAutoCompleteObserver,
			       public nsITimerCallback,
			       public nsITreeView,
#endif
                               public nsIAutoCompleteSearch
{
public:
	nsDanbooruAutoComplete();
	~nsDanbooruAutoComplete();

	NS_DECL_ISUPPORTS
	NS_DECL_NSIDANBOORUAUTOCOMPLETE
	NS_DECL_NSIAUTOCOMPLETESEARCH

#ifdef DANBOORUUP_SELF_AUTOCOMPLETECONTROLLER
	NS_DECL_NSIAUTOCOMPLETECONTROLLER
	NS_DECL_NSIAUTOCOMPLETEOBSERVER
	NS_DECL_NSITIMERCALLBACK
	NS_DECL_NSITREEVIEW

protected:
	nsresult OpenPopup();
	nsresult ClosePopup();

	nsresult ControllerStartSearch();
	nsresult ControllerStopSearch();

	nsresult StartSearchTimer();
	nsresult ClearSearchTimer();

	nsresult ProcessResult(PRInt32 aSearchIndex, nsIAutoCompleteResult *aResult);
	nsresult PostSearchCleanup();

	nsresult EnterMatch();
	nsresult RevertTextValue();

	nsresult CompleteDefaultIndex(PRInt32 aSearchIndex);
	nsresult CompleteValue(nsString &aValue, PRBool selectDifference);
	nsresult GetResultValueAt(PRInt32 aIndex, PRBool aValueOnly, nsAString & _retval);

	nsresult ClearResults();

	nsresult RowIndexToSearch(PRInt32 aRowIndex, PRInt32 *aSearchIndex, PRInt32 *aItemIndex);

	// members //////////////////////////////////////////

	nsCOMPtr<nsIAutoCompleteInput> mInput;

	nsCOMPtr<nsISupportsArray> mSearches;
	nsCOMPtr<nsISupportsArray> mResults;

	nsCOMPtr<nsITimer> mTimer;
	nsCOMPtr<nsITreeSelection> mSelection;
	nsCOMPtr<nsITreeBoxObject> mTree;

	nsString mSearchString;
	PRPackedBool mEnterAfterSearch;
	PRPackedBool mDefaultIndexCompleted;
	PRPackedBool mBackspaced;
	PRPackedBool mPopupClosedByCompositionStart;
	PRPackedBool mIsIMEComposing;
	PRPackedBool mIgnoreHandleText;
	PRUint16 mSearchStatus;
	PRUint32 mRowCount;
	PRUint32 mSearchesOngoing;
#endif
};
