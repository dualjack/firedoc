//  Helper type for extracting doc fields type from DocEntity class.
import {MaybeCallable} from "./helpers.js";
import {type DocumentReference, FieldValue, type Firestore, Timestamp} from "firebase-admin/firestore";

export type InferFireDocFields<Type> = Type extends FireDoc<infer X> ? X : never;

//  Firebase firestore Doc wrapper.
export class FireDoc<FIELDS extends Object> {

    declare Fields: FIELDS;

    protected firestore: Firestore;
    protected collectionPath: MaybeCallable<string>;

    private readonly docRefId: string;
    private docFields: Partial<FIELDS>;

    private docFieldKeysChanged : Array<string> = [];
    public readonly docRef: DocumentReference;

    constructor(options: {
        firestore: Firestore,
        id?: string,
        docFields?: Partial<FIELDS>,
        collectionPath: MaybeCallable<string>
    }){

        const {
            firestore,
            id,
            docFields = {},
            collectionPath
        } = options;

        this.docFields = docFields;
        this.firestore = firestore;
        this.collectionPath = collectionPath;

        if(id){
            this.docRefId = id;
            this.docRef = firestore.doc(this.getDocumentPath());
        } else {
            this.docRef = firestore.collection(this.getCollectionPath()).doc();
            this.docRefId = this.docRef.id;
        }

    }

    protected getCollectionPath(){
        return typeof this.collectionPath === 'function' ? this.collectionPath() : this.collectionPath;
    }
    protected getDocumentPath(){
        return this.getCollectionPath() + '/' + this.id;
    }

    get id(): string {
        return this.docRefId;
    }

    public getDocDataForSaveOperation(onlyChanged : boolean = false) : FIELDS {

        const docFieldsToSave = {} as FIELDS;

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

    public getAllFields(): Partial<FIELDS> {
        return this.docFields;
    }

    public getField<K extends keyof FIELDS>(fieldName: K){

        let value = this.docFields[fieldName];

        //  Convert Timestamp object to Date.
        if(value instanceof Timestamp){
            value = value.toDate() as FIELDS[K];
        }

        return value;
    }

    public setField<T extends FIELDS, K extends keyof FIELDS>(fieldName: K, value: T[K]): this {
        this.docFields[fieldName] = (typeof value === 'undefined' ? FieldValue.delete() : value) as FIELDS[K];
        this.docFieldKeysChanged.push(fieldName as string);
        return this;
    }

    public setFields(fields: Partial<FIELDS>): this {

        Object.entries(fields).forEach(([key, value]) => {
            this.setField(key as keyof FIELDS, value);
        });

        return this;

    }

    //  This will throw if document does not exist.
    public async load(): Promise<this> {

        const snapshot = await this.docRef.get();
        const docData = snapshot.data() as FIELDS|undefined;

        if(docData){
            this.resetDocFieldKeysChanged();   //  Reset markers.
            this.docFields = docData;
        } else {
            throw `Document ${this.id} does not exist`;
        }

        return this;

    }

    public async save(option: boolean|'changes'|'overwrite' = 'changes'): Promise<typeof this> {

        //  Fallback for using boolean option.
        const onlyChanges = typeof option === 'boolean' ? option : option === 'changes';

        const docData = this.getDocDataForSaveOperation(onlyChanges);

        this.resetDocFieldKeysChanged();   //  Reset markers.

        if(Object.keys(docData).length){    //  Check if docData is not empty.
            await this.docRef.set(docData as any, {merge: onlyChanges});
        }

        return this;
    }

    async delete(): Promise<this> {
        await this.docRef.delete();
        return this;
    }

}