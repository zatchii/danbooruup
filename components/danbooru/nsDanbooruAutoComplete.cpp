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

#include "nsDanbooruAutoComplete.h"
#include "nsDanbooruTagHistory.h"
#include "nsMemory.h"

#include "nsIAutoCompleteResultTypes.h"
#include "nsString.h"

#include "nsEmbedString.h"
////////////////////////////////////////////////////////////////////////

nsDanbooruAutoComplete::nsDanbooruAutoComplete() : mValue(nsnull)
{
    //mValue = (char*)nsMemory::Clone("initial value", 14);
}

nsDanbooruAutoComplete::~nsDanbooruAutoComplete()
{
//    if (mValue)
//        nsMemory::Free(mValue);
}

/**
 * NS_IMPL_ISUPPORTS1 expands to a simple implementation of the nsISupports
 * interface.  This includes a proper implementation of AddRef, Release,
 * and QueryInterface.  If this class supported more interfaces than just
 * nsISupports,
 * you could use NS_IMPL_ADDREF() and NS_IMPL_RELEASE() to take care of the
 * simple stuff, but you would have to create QueryInterface on your own.
 * nsSampleFactory.cpp is an example of this approach.
 * Notice that the second parameter to the macro is name of the interface, and
 * NOT the #defined IID.
 *
 * The _CI variant adds support for nsIClassInfo, which permits introspection
 * and interface flattening.
 */
//NS_IMPL_ISUPPORTS1_CI(nsDanbooruAutoComplete, nsIDanbooruAutoComplete)

NS_INTERFACE_MAP_BEGIN(nsDanbooruAutoComplete)
	NS_INTERFACE_MAP_ENTRY(nsIDanbooruAutoComplete)
	NS_INTERFACE_MAP_ENTRY(nsIAutoCompleteSearch)
	NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIDanbooruAutoComplete)
NS_INTERFACE_MAP_END

NS_IMPL_ADDREF(nsDanbooruAutoComplete)
NS_IMPL_RELEASE(nsDanbooruAutoComplete)

/**
 * Notice that in the protoype for this function, the NS_IMETHOD macro was
 * used to declare the return type.  For the implementation, the return
 * type is declared by NS_IMETHODIMP
 */
NS_IMETHODIMP
nsDanbooruAutoComplete::GetValue(char** aValue)
{
    NS_PRECONDITION(aValue != nsnull, "null ptr");
    if (! aValue)
        return NS_ERROR_NULL_POINTER;

    if (mValue) {
        /**
         * GetValue's job is to return data known by an instance of
         * nsSample to the outside world.  If we  were to simply return
         * a pointer to data owned by this instance, and the client were to
         * free it, bad things would surely follow.
         * On the other hand, if we create a new copy of the data for our
         * client, and it turns out that client is implemented in JavaScript,
         * there would be no way to free the buffer.  The solution to the
         * buffer ownership problem is the nsMemory singleton.  Any buffer
         * returned by an XPCOM method should be allocated by the nsMemory.
         * This convention lets things like JavaScript reflection do their
         * job, and simplifies the way C++ clients deal with returned buffers.
         */
        *aValue = (char*) nsMemory::Clone(mValue, strlen(mValue) + 1);
        if (! *aValue)
            return NS_ERROR_NULL_POINTER;
    }
    else {
        *aValue = nsnull;
    }
    return NS_OK;
}

NS_IMETHODIMP
nsDanbooruAutoComplete::SetValue(const char* aValue)
{
    NS_PRECONDITION(aValue != nsnull, "null ptr");
    if (! aValue)
        return NS_ERROR_NULL_POINTER;

    if (mValue) {
        nsMemory::Free(mValue);
    }

    /**
     * Another buffer passing convention is that buffers passed INTO your
     * object ARE NOT YOURS.  Keep your hands off them, unless they are
     * declared "inout".  If you want to keep the value for posterity,
     * you will have to make a copy of it.
     */
    mValue = (char*) nsMemory::Clone(aValue, strlen(aValue) + 1);
    return NS_OK;
}

NS_IMETHODIMP
nsDanbooruAutoComplete::Poke(const char* aValue)
{
    return SetValue((char*) aValue);
}


static void GetStringValue(nsACString& aValue)
{
    NS_CStringSetData(aValue, "GetValue");
}

NS_IMETHODIMP
nsDanbooruAutoComplete::WriteValue(const char* aPrefix)
{
    NS_PRECONDITION(aPrefix != nsnull, "null ptr");
    if (! aPrefix)
        return NS_ERROR_NULL_POINTER;

    printf("%s %s\n", aPrefix, mValue);

    // This next part illustrates the nsEmbedString:
    nsEmbedString foopy;
    foopy.Append(PRUnichar('f'));
    foopy.Append(PRUnichar('o'));
    foopy.Append(PRUnichar('o'));
    foopy.Append(PRUnichar('p'));
    foopy.Append(PRUnichar('y'));

    const PRUnichar* f = foopy.get();
    PRUint32 l = foopy.Length();
    printf("%c%c%c%c%c %d\n", char(f[0]), char(f[1]), char(f[2]), char(f[3]), char(f[4]), l);

    nsEmbedCString foopy2;
    GetStringValue(foopy2);

    //foopy2.AppendLiteral("foopy");
    const char* f2 = foopy2.get();
    PRUint32 l2 = foopy2.Length();

    printf("%s %d\n", f2, l2);

    return NS_OK;
}

/* pilfered from nsSchemaLoader also */
static nsresult
GetResolvedURI(const nsAString& aSchemaURI,
		const char* aMethod,
		nsIURI** aURI)
{
  nsresult rv;
  nsCOMPtr<nsIXPCNativeCallContext> cc;
  nsCOMPtr<nsIXPConnect> xpc(do_GetService(nsIXPConnect::GetCID(), &rv));
  if(NS_SUCCEEDED(rv)) {
    rv = xpc->GetCurrentNativeCallContext(getter_AddRefs(cc));
  }

  if (NS_SUCCEEDED(rv) && cc) {
    JSContext* cx;
    rv = cc->GetJSContext(&cx);
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIScriptSecurityManager> secMan(do_GetService(NS_SCRIPTSECURITYMANAGER_CONTRACTID, &rv));
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIURI> baseURI;
    nsCOMPtr<nsIPrincipal> principal;
    rv = secMan->GetSubjectPrincipal(getter_AddRefs(principal));
    if (NS_SUCCEEDED(rv)) {
      principal->GetURI(getter_AddRefs(baseURI));
    }

    rv = NS_NewURI(aURI, aSchemaURI, nsnull, baseURI);
    if (NS_FAILED(rv)) return rv;

    rv = secMan->CheckLoadURIFromScript(cx, *aURI);
    if (NS_FAILED(rv))
    {
      // Security check failed. The above call set a JS exception. The
      // following lines ensure that the exception is propagated.
      cc->SetExceptionWasThrown(PR_TRUE);
      return rv;
    }
  }
  else {
    rv = NS_NewURI(aURI, aSchemaURI, nsnull);
    if (NS_FAILED(rv)) return rv;
  }

  return NS_OK;
}

static nsresult
ProcessTagXML(nsIDOMElement *document)
{
	NS_ENSURE_ARG(document);

	nsCOMPtr<nsIDOMNodeList> nodeList;
	PRUint32 index = 0;
	PRUint32 length = 0;
	document->GetChildNodes(getter_AddRefs(nodeList));

	if (nodeList) {
		nodeList->GetLength(&length);
	} else {
		// no tags?
		return NS_ERROR_FAILURE;
	}

	nsCOMPtr<nsIDOMNode> child;
	nsDanbooruTagHistory *history = nsDanbooruTagHistory::GetInstance();
	while (index < length) {
		nodeList->Item(index++, getter_AddRefs(child));
		nsCOMPtr<nsIDOMElement> childElement(do_QueryInterface(child));
		if (!childElement) {
			continue;
		}

		nsAutoString tagname;

		childElement->GetAttribute(NS_LITERAL_STRING("name"), tagname);
		if (history) {
			PRUint32 count = 0;
		if (!tagname.IsEmpty()) {
			char *ctagname = ToNewCString(tagname);
			history->AddEntry(tagname, 0);
			history->GetRowCount(&count);
			printf("%d\t%s\n", count, ctagname);
			nsMemory::Free(ctagname);
		}
		}
		else { printf("nohistory\n"); }
	}
	NS_RELEASE(history);

	return NS_OK;
}

/* used to be the nsISchema load */
NS_IMETHODIMP
nsDanbooruAutoComplete::UpdateTagListFrom(const nsAString &aXmlURI)
{
  nsCOMPtr<nsIURI> resolvedURI;
  nsresult rv = GetResolvedURI(aXmlURI, "load", getter_AddRefs(resolvedURI));
  if (NS_FAILED(rv)) {
    return rv;
  }
  nsCAutoString spec;
  resolvedURI->GetSpec(spec);

  nsCOMPtr<nsIXMLHttpRequest> request(do_CreateInstance(NS_XMLHTTPREQUEST_CONTRACTID, &rv));
  if (!request) {
printf("req: %d\n", rv);
    return rv;
  }
printf("request\n", rv);

  const nsAString& empty = EmptyString();
  rv = request->OpenRequest(NS_LITERAL_CSTRING("GET"), spec, PR_FALSE, empty,
                            empty);
  if (NS_FAILED(rv)) {
printf("openreq: %d\n", rv);
    return rv;
  }
printf("openrequest\n", rv);

  // Force the mimetype of the returned stream to be xml.
  rv = request->OverrideMimeType(NS_LITERAL_CSTRING("application/xml"));
  if (NS_FAILED(rv)) {
printf("mime: %d\n", rv);
    return rv;
  }
printf("setmime\n", rv);

  rv = request->Send(nsnull);
  if (NS_FAILED(rv)) {
printf("send: %d\n", rv);
    return rv;
  }
printf("send\n", rv);

  nsCOMPtr<nsIDOMDocument> document;
  rv = request->GetResponseXML(getter_AddRefs(document));
  if (NS_FAILED(rv)) {
printf("xml: %d\n", rv);
    return rv;
  }
printf("xml\n", rv);

  nsCOMPtr<nsIDOMElement> element;
  document->GetDocumentElement(getter_AddRefs(element));
  if (element) {
    rv = ProcessTagXML(element);
  }
  else {
printf("can't convert\n", rv);
    rv = NS_ERROR_CANNOT_CONVERT_DATA;
  }

printf("final verdict: %d\n", rv);
  return rv;
}

////////////////////////////
// nsIAutoCompleteSearch

NS_IMETHODIMP
nsDanbooruAutoComplete::StartSearch(const nsAString &aSearchString, const nsAString &aSearchParam,
					nsIAutoCompleteResult *aPreviousResult, nsIAutoCompleteObserver *aListener)
{
	NS_ENSURE_ARG_POINTER(aListener);

	nsCOMPtr<nsIAutoCompleteResult> result;
	nsCOMPtr<nsIAutoCompleteMdbResult> mdbResult = do_QueryInterface(aPreviousResult);

	nsDanbooruTagHistory *history = nsDanbooruTagHistory::GetInstance();
	if (history) {
		nsresult rv = history->AutoCompleteSearch(aSearchString, 0,
				NS_STATIC_CAST(nsIAutoCompleteMdbResult *,
					aPreviousResult),
				getter_AddRefs(result));

		NS_ENSURE_SUCCESS(rv, rv);
		NS_RELEASE(history);
	}		
	aListener->OnSearchResult(this, result);  

	return NS_OK;
}

NS_IMETHODIMP
nsDanbooruAutoComplete::StopSearch()
{
	return NS_OK;
}

#if 1 && 0

nsresult
nsFormHistory::OpenDatabase()
{
  if (mStore)
    return NS_OK;

  // Get a handle to the database file
  nsCOMPtr <nsIFile> historyFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR, getter_AddRefs(historyFile));
  NS_ENSURE_SUCCESS(rv, rv);
  historyFile->Append(NS_ConvertUTF8toUCS2(kFormHistoryFileName));

  // Get an Mdb Factory
  static NS_DEFINE_CID(kMorkCID, NS_MORK_CID);
  nsCOMPtr<nsIMdbFactoryFactory> mdbFactory = do_CreateInstance(kMorkCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mdbFactory->GetMdbFactory(getter_AddRefs(mMdbFactory));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create the Mdb environment
  mdb_err err = mMdbFactory->MakeEnv(nsnull, &mEnv);
  NS_ASSERTION(err == 0, "ERROR: Unable to create Tab History mdb");
  mEnv->SetAutoClear(PR_TRUE);
  NS_ENSURE_TRUE(!err, NS_ERROR_FAILURE);
  mEnv->SetErrorHook(new SatchelErrorHook());

  nsCAutoString filePath;
  historyFile->GetNativePath(filePath);
  PRBool exists = PR_TRUE;
  historyFile->Exists(&exists);

  if (!exists || NS_FAILED(rv = OpenExistingFile(filePath.get()))) {
    // If the file doesn't exist, or we fail trying to open it,
    // then make sure it is deleted and then create an empty database file
    historyFile->Remove(PR_FALSE);
    rv = CreateNewFile(filePath.get());
  }
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the initial size of the file, needed later for Commit
  historyFile->GetFileSize(&mFileSizeOnDisk);

  return NS_OK;
}

PRBool
nsFormHistory::RowMatch(nsIMdbRow *aRow, const nsAString &aInputName, const nsAString &aInputValue, PRUnichar **aValue)
{
  nsAutoString name;
  GetRowValue(aRow, kToken_NameColumn, name);

  if (name.Equals(aInputName)) {
    nsAutoString value;
    GetRowValue(aRow, kToken_ValueColumn, value);
    if (Compare(Substring(value, 0, aInputValue.Length()), aInputValue, nsCaseInsensitiveStringComparator()) == 0) {
      if (aValue)
        *aValue = ToNewUnicode(value);
      return PR_TRUE;
    }
  }

  return PR_FALSE;
}




#endif




