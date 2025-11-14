import {type DocumentReference, type Firestore} from "firebase-admin/firestore";
import type {Query} from "firebase-admin/firestore";
import {FireDoc} from "./FireDoc.js";
import {MaybeCallable} from "./helpers.js";

type Options = {
    firestore: Firestore,
    collectionPath: MaybeCallable<string>
}

export function registerFireDoc<FIELDS extends object>(options: Options){

    const {
        firestore,
        collectionPath
    } = options;

    return {
        collection(){
            return firestore.collection(
                typeof collectionPath === 'function'
                ? collectionPath()
                : collectionPath
            );
        },
        create(id?: string, fields?: Partial<FIELDS>): FireDoc<FIELDS>{
            return new FireDoc({
                firestore,
                id,
                docFields: fields,
                collectionPath
            });
        },
        withId(id: string){
            return new FireDoc<FIELDS>({
                firestore,
                id,
                collectionPath
            });
        },
        async withQuery(
            query: Query
        ): Promise<FireDoc<FIELDS>[]> {
            const snapshot = await query.get();
            return Promise.all(snapshot.docs.map(doc => new FireDoc<FIELDS>({
                firestore: doc.ref.firestore,
                id: doc.id,
                docFields: doc.data() as any,
                collectionPath
            })));
        },
        async withDocRef(
            docRef: DocumentReference
        ): Promise<FireDoc<FIELDS>> {
            const data = await docRef.get().then(doc => doc.data());
            return new FireDoc<FIELDS>({
                firestore: docRef.firestore,
                id: docRef.id,
                docFields: data as FIELDS,
                collectionPath
            });
        },
        async withRawFilter(
            firestore: Firestore,
            input: {
                page: number,
                perPage: number,
                filter: (docData: FIELDS, id: string) => boolean
            }
        ): Promise<{allPages: number, docs: FireDoc<FIELDS>[]}> {

            const searchPerPage = 100;
            const searchFoundItemIds: string[] = [];
            let searchPage = 0;

            //  Fake collection to get the parent collection.
            const collection = firestore.collection(
                typeof collectionPath === 'function'
                    ? collectionPath()
                    : collectionPath
            );

            while(true){

                const query = collection.offset(searchPage * searchPerPage).limit(searchPerPage);
                const docs = await query.get().then(snapshot => snapshot.docs);

                //  Check if it's interesting for us.
                const ids = docs.filter((doc) => {
                    return input.filter(doc.data() as any, doc.id);
                }).map(doc => doc.id);

                //  Nothing found. Break the loop.
                if(ids.length === 0){
                    break;
                }

                searchFoundItemIds.push(...ids);
                searchPage++;

            }

            //  Calculate num of pages.
            const allPages = Math.ceil(searchFoundItemIds.length / input.perPage);

            const idsFilteredByPagination = searchFoundItemIds.slice(
                input.perPage * (input.page - 1),
                input.perPage * input.page
            );

            return {
                allPages,
                docs: await Promise.all(idsFilteredByPagination.map((id) => {
                    return new FireDoc<FIELDS>({
                        firestore,
                        id,
                        collectionPath
                    }).load()
                }))
            };

        },
        Fields: undefined as unknown as FIELDS
    }

}