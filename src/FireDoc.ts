import {type DocumentReference, Timestamp, FieldValue, type Firestore} from "firebase-admin/firestore";
import type {Query} from "firebase-admin/firestore";

//  Helper type for extracting doc fields type from DocEntity class.
export type InferFireDocFields<Type> = Type extends FireDoc<infer X> ? X : never;

//  Firebase firestore Doc wrapper.
export abstract class FireDoc<FireDocFields extends Object> {
    
    declare Fields: FireDocFields;

    protected firestore: Firestore;

    private readonly docRefId: string;
    private docFields: FireDocFields;

    private docFieldKeysChanged : Array<string> = [];
    public readonly docRef: DocumentReference;

    public isNewDocument: boolean = false;

    constructor(firestore: Firestore, id: string|null = null, docFields: FireDocFields = {} as FireDocFields) {

        this.docFields = docFields;
        this.firestore = firestore;

        if(id){
            this.docRefId = id;
            this.docRef = firestore.doc(this.getDocumentPath());
        } else {
            this.docRef = firestore.collection(this.getCollectionPath()).doc();
            this.docRefId = this.docRef.id;
            this.isNewDocument = true;
        }

    }

    protected abstract getCollectionPath(): string;
    
    protected getDocumentPath(){
        return this.getCollectionPath() + '/' + this.id;
    };

    get id(): string {
        return this.docRefId;
    }

    public getDocDataForSaveOperation(onlyChanged : boolean = false) : FireDocFields {

        const docFieldsToSave = {} as FireDocFields;

        if(onlyChanged){

            //  If onlyChanged, we look for all fields that have been marked as changed
            //  and copy their values to the target array.
            for(const key of this.docFieldKeysChanged){
                if(Object.keys(this.docFields).includes(key)){
                    (docFieldsToSave as any)[key] = (this.docFields as any)[key];
                }
            }

        } else {
            Object.assign(docFieldsToSave, this.docFields);
        }

        return docFieldsToSave;

    }

    public resetDocFieldKeysChanged(){
        this.docFieldKeysChanged = [];

        return this;
    }

    public getAllFields(): FireDocFields {
        return this.docFields;
    }

    public getField<K extends keyof FireDocFields>(fieldName: K){

        let value = this.docFields[fieldName];

        //  Convert Timestamp object to Date.
        if(value instanceof Timestamp){
            value = value.toDate() as FireDocFields[K];
        }

        return value;
    }

    public setField<T extends FireDocFields, K extends keyof FireDocFields>(fieldName: K, value: T[K]): this {
        this.docFields[fieldName] = (typeof value === 'undefined' ? FieldValue.delete() : value) as FireDocFields[K];
        this.docFieldKeysChanged.push(fieldName as string);
        return this;
    }

    public setFields(fields: Partial<FireDocFields>): this {

        Object.entries(fields).forEach(([key, value]) => {
            this.setField(key as keyof FireDocFields, value);
        });

        return this;

    }

    //  This will throw if document does not exist.
    public async load(): Promise<this> {

        const snapshot = await this.docRef.get();
        const docData = snapshot.data() as FireDocFields|undefined;

        if(docData){
            this.resetDocFieldKeysChanged();   //  Reset markers.
            this.docFields = docData;
        } else {
            throw `Document ${this.id} does not exist`;
        }

        return this;

    }

    static async load<T extends object, K extends FireDoc<T>>(
        this: new (firestore: Firestore, id: string) => K,
        db: Firestore,
        id: string
    ): Promise<K> {
        return new this(db, id).load();
    }

    static async withQuery<T extends object, K extends FireDoc<T>>(
        this: new (firestore: Firestore, id: string, data: InferFireDocFields<K>) => K,
        query: Query
    ): Promise<K[]> {
        const snapshot = await query.get();
        return snapshot.docs.map(doc => new this(doc.ref.firestore, doc.id, doc.data() as any));
    }

    static async withDocRef<T extends object, K extends FireDoc<T>>(
        this: new (firestore: Firestore, id: string, data: InferFireDocFields<K>) => K,
        docRef: DocumentReference
    ): Promise<K> {
        const data = docRef.get().then(doc => doc.data());
        return new this(docRef.firestore, docRef.id, data as any);
    }

    static async withRawFilter<T extends object, K extends FireDoc<T>>(
        this: new (firestore: Firestore, id: string) => K,
        firestore: Firestore,
        input: {
            page: number,
            perPage: number,
            filter: (docData: InferFireDocFields<K>,  id: string) => boolean
        }
    ): Promise<{allPages: number, docs: K[]}> {

        const searchPerPage = 100;
        const searchFoundItemIds: string[] = [];
        let searchPage = 0;

        //  Fake collection to get the parent collection.
        const collection = new this(firestore, '__FAKE').docRef.parent;

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
                return new this(firestore, id).load()
            }))
        };

    }

    public async save(onlyChanged = true): Promise<typeof this> {
        const docData = this.getDocDataForSaveOperation(onlyChanged);

        this.resetDocFieldKeysChanged();   //  Reset markers.

        if(Object.keys(docData).length){    //  Check if docData is not empty.
            await this.docRef.set(docData as any, {merge: true});
        }

        return this;
    }

    async delete(): Promise<this> {
        await this.docRef.delete();
        return this;
    }

}