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

#include "danbooruIAutoCompleteController.h"
#include "danbooruIAutoCompleteArrayResult.h"
#include "nsIAutoCompleteController.h"
#include "nsIAutoCompleteInput.h"
#include "nsIAutoCompleteSearch.h"
#include "nsITreeView.h"
#include "nsITimer.h"
#include "nsIRollupListener.h"
#include "nsIConsoleService.h"
#include "nsTArray.h"
#include "nsDataHashtable.h"

#define DANBOORU_ACC_CID \
{ 0xc6c02dc0, 0x7630, 0x4a92, { 0x9a, 0x1c, 0x14, 0xc6, 0xf0, 0xe2, 0x7, 0x96 } }
#define DANBOORU_ACC_CONTRACTID "@unbuffered.info/danbooru/autocomplete-controller;1"

class danbooruAutoCompleteController : public danbooruIAutoCompleteController,
#ifdef MOZILLA_1_8_BRANCH
                                       public nsIAutoCompleteController_MOZILLA_1_8_BRANCH,
#else
                                       public nsIAutoCompleteController,
#endif
                                       public nsIAutoCompleteObserver,
                                       public nsIRollupListener,
                                       public nsITimerCallback,
                                       public nsITreeView
{
public:
	danbooruAutoCompleteController();
	~danbooruAutoCompleteController();

	NS_DECL_ISUPPORTS
	NS_DECL_DANBOORUIAUTOCOMPLETECONTROLLER
	NS_DECL_NSIAUTOCOMPLETECONTROLLER
#ifdef MOZILLA_1_8_BRANCH
	NS_DECL_NSIAUTOCOMPLETECONTROLLER_MOZILLA_1_8_BRANCH
#endif
	NS_DECL_NSIAUTOCOMPLETEOBSERVER
	NS_DECL_NSIROLLUPLISTENER
	NS_DECL_NSITREEVIEW
	NS_DECL_NSITIMERCALLBACK

protected:
#ifdef MOZILLA_1_8_BRANCH
	nsCOMPtr<nsIAutoCompleteController_MOZILLA_1_8_BRANCH> mController;
#else
	nsCOMPtr<nsIAutoCompleteController> mController;
#endif
	nsCOMPtr<nsIAutoCompleteObserver> mObserver;
	nsCOMPtr<nsIRollupListener> mRollup;
	nsCOMPtr<nsITimerCallback> mTimer;
	nsCOMPtr<nsITreeView> mTreeView;

	// copy of the ones passed along to the nsIAutoCompleteController
	nsCOMPtr<nsITreeBoxObject> mTree;
	nsCOMPtr<nsIAutoCompleteInput> mInput;

	// since we can't get a sorted list of hash keys
	nsTArray<PRUint32> mRelatedKeys;
	nsDataHashtable<nsUint32HashKey, danbooruIAutoCompleteArrayResult* > mRelatedHash;

	nsCOMPtr<nsIConsoleService> mConsole;

	void ClearRelated();
	PRUint32 FirstLevelRowIndex(PRInt32 index);
};

