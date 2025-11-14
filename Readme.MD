# DualJack's FireDoc

This is a simple, hard-typed wrapper around Google Firestore database.

It's still in development but the overall 
functionality is ready-to-use and battle-tested.

![NPM Version](https://img.shields.io/npm/v/%40dualjack%2Ffiredoc)

## Quick start

Somewhere in your project. For example globally 
accessible server-side "src/server/db.ts".

```ts
import {registerFireDoc} from "@dualjack/firedoc";
import {firestore} from "<imaginary_directory>/firestore";

type UserDocFields = {
    email: string,
    name: string,
}

export const users = registerFireDoc<UserDocFields>({
    firestore,
    collectionPath: 'users'
});

```

Now you can import your registered wrapper to 
create, query, delete documents with full typescript support.


```ts

import {users} from "<imaginary_directory>/db";

//  Create new user with random ID.
const user = users.create();

//  You can chain methods.
await user
    .setFields({
        name: 'test',
        email: 'test@test.pl'
    })
    .setField('name', 'new name')
    .save();

//  Delete document.
await user.delete();


//  Query documents.
const knownUser = await users.withId('known123').load();

//  This is slow but bypasses limitations of indexed firestore queries.
//  Use if you are absolutely sure there is no 
const searchUsersDirty = await users.withRawFilter(firestore, {
    page: 1,
    perPage: 10,
    filter: (docData, id) => {
        return docData.email.includes('test');
    }
});

const searchUsersWithQuery = await users.withQuery(
    users.collection().where('email', '==', 'test@trst.pl')
);

```