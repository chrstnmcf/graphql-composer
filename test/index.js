'use strict'
const { deepStrictEqual, rejects, strictEqual, deepEqual } = require('node:assert')
const { test } = require('node:test')
const { graphqlRequest, startRouter } = require('./helper')

test('proxy a simple single query to a single subgraph', async (t) => {
  const router = await startRouter(t, ['authors-subgraph'])
  const query = `
    query {
      list {
        id name { firstName lastName }
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    list: [{ id: '1', name: { firstName: 'Peter', lastName: 'Pluck' } }, { id: '2', name: { firstName: 'John', lastName: 'Writer' } }]
  })
})

test('query with a literal argument', async (t) => {
  const router = await startRouter(t, ['books-subgraph'])
  const query = `
    query {
      getBook(id: 1) {
        id genre
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    getBook: { id: '1', genre: 'FICTION' }
  })
})

test('query with a variable argument', async (t) => {
  const router = await startRouter(t, ['books-subgraph'])
  const query = `
    query GetBookById($id: ID!) {
      getBook(id: $id) {
        id genre
      }
    }
  `
  const data = await graphqlRequest(router, query, { id: 2 })

  deepStrictEqual(data, {
    getBook: { id: '2', genre: 'NONFICTION' }
  })
})

test('nested query with a literal argument', async (t) => {
  const router = await startRouter(t, ['authors-subgraph'])
  const query = `
    query {
      list {
        id
        name {
          firstName
          lastName
        }
        todos(id: 2) {
          task
        }
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    list: [
      {
        id: '1',
        name: {
          firstName: 'Peter',
          lastName: 'Pluck'
        },
        todos: [
          {
            task: 'Get really creative'
          }
        ]
      },
      {
        id: '2',
        name: {
          firstName: 'John',
          lastName: 'Writer'
        },
        todos: [
          {
            task: 'Get really creative'
          }
        ]
      }
    ]
  })
})

test('nested query with a variable argument', async (t) => {
  const router = await startRouter(t, ['authors-subgraph'])
  const query = `
    query GetAuthorListWithTodos($id: ID!) {
      list {
        id
        name {
          firstName
          lastName
        }
        todos(id: $id) {
          task
        }
      }
    }
  `
  const data = await graphqlRequest(router, query, { id: 1 })

  deepStrictEqual(data, {
    list: [
      {
        id: '1',
        name: {
          firstName: 'Peter',
          lastName: 'Pluck'
        },
        todos: [
          {
            task: 'Write another book'
          }
        ]
      },
      {
        id: '2',
        name: {
          firstName: 'John',
          lastName: 'Writer'
        },
        todos: [
          {
            task: 'Write another book'
          }
        ]
      }
    ]
  })
})

test('support query aliases', async (t) => {
  const router = await startRouter(t, ['books-subgraph'])
  const query = `
    query {
      aliasedGetBook: getBook(id: 1) {
        id genre
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    aliasedGetBook: { id: '1', genre: 'FICTION' }
  })
})

test('scalar return type', async (t) => {
  const router = await startRouter(t, ['books-subgraph'])
  const query = `
    query {
      getBookTitle(id: 1)
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    getBookTitle: 'A Book About Things That Never Happened'
  })
})

test('query with meta fields', async (t) => {
  const router = await startRouter(t, ['books-subgraph'])
  const query = `
    query {
      getBook(id: 1) {
        __typename
        ...on Book { id, genre }
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    getBook: {
      __typename: 'Book',
      id: '1',
      genre: 'FICTION'
    }
  })
})

test('query with a fragment', async (t) => {
  const router = await startRouter(t, ['books-subgraph'])
  const query = `
    fragment bookFields on Book { id title genre }

    query GetBookById($id: ID!) {
      getBook(id: $id) {
        ...bookFields
      }
    }
  `
  const data = await graphqlRequest(router, query, { id: 1 })

  deepStrictEqual(data, {
    getBook: {
      id: '1',
      genre: 'FICTION',
      title: 'A Book About Things That Never Happened'
    }
  })
})

test('resolves a partial entity from a single subgraph', async (t) => {
  const router = await startRouter(t, ['books-subgraph', 'reviews-subgraph'])
  const query = `
    query {
      getReviewBook(id: 1) {
        id
        reviews {
          id
          rating
          content
        }
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    getReviewBook: {
      id: '1',
      reviews: [
        {
          id: '1',
          rating: 2,
          content: 'Would not read again.'
        }
      ]
    }
  })
})

test('resolves an entity across multiple subgraphs', async (t) => {
  const router = await startRouter(t, ['books-subgraph', 'reviews-subgraph'])

  await t.test('query flows from non-owner to owner subgraph', async (t) => {
    const query = `
      query {
        getReviewBook(id: 1) {
          id
          title
          genre
          reviews {
            id
            rating
            content
          }
        }
      }
    `
    const data = await graphqlRequest(router, query)

    deepStrictEqual(data, {
      getReviewBook: {
        id: '1',
        title: 'A Book About Things That Never Happened',
        genre: 'FICTION',
        reviews: [
          {
            id: '1',
            rating: 2,
            content: 'Would not read again.'
          }
        ]
      }
    })
  })

  await t.test('query flows from owner to non-owner subgraph', async (t) => {
    const query = `
      query {
        getBook(id: 1) {
          id
          title
          genre
          reviews {
            id
            rating
            content
          }
        }
      }
    `
    const data = await graphqlRequest(router, query)

    deepStrictEqual(data, {
      getBook: {
        id: '1',
        title: 'A Book About Things That Never Happened',
        genre: 'FICTION',
        reviews: [
          {
            id: '1',
            rating: 2,
            content: 'Would not read again.'
          }
        ]
      }
    })
  })

  await t.test('fetches key fields not in selection set', async (t) => {
    const query = `
      query {
        getReviewBook(id: 1) {
          # id not included and it is part of the keys.
          title
          genre
          reviews {
            id
            rating
            content
          }
        }
      }
    `
    const data = await graphqlRequest(router, query)

    deepStrictEqual(data, {
      getReviewBook: {
        title: 'A Book About Things That Never Happened',
        genre: 'FICTION',
        reviews: [
          {
            id: '1',
            rating: 2,
            content: 'Would not read again.'
          }
        ]
      }
    })
  })
})

test('multiple queries in a single request', async (t) => {
  const router = await startRouter(t, ['authors-subgraph', 'books-subgraph'])
  const query = `
    query {
      getBook(id: 2) {
        id genre
      }
      list {
        id name { firstName lastName }
      }
    }
  `
  const data = await graphqlRequest(router, query)

  deepStrictEqual(data, {
    getBook: { id: '2', genre: 'NONFICTION' },
    list: [{ id: '1', name: { firstName: 'Peter', lastName: 'Pluck' } }, { id: '2', name: { firstName: 'John', lastName: 'Writer' } }]
  })
})

test('Mutations', async () => {
  await test('simple mutation', async (t) => {
    const router = await startRouter(t, ['authors-subgraph'])
    const query = `
      mutation CreateAuthor($author: AuthorInput!) {
        createAuthor(author: $author) {
          id name { firstName lastName }
        }
      }
    `
    const author = { firstName: 'John', lastName: 'Johnson' }
    const data = await graphqlRequest(router, query, { author })

    deepStrictEqual(data, {
      createAuthor: {
        id: '3',
        name: { firstName: 'John', lastName: 'Johnson' }
      }
    })
  })

  await test('simple mutation with input object literal', async (t) => {
    const router = await startRouter(t, ['authors-subgraph'])
    const query = `
      mutation {
        createAuthor(author: { firstName: "Tuco", lastName: "Gustavo" }) {
          id name { firstName lastName }
        }
      }
    `
    const data = await graphqlRequest(router, query)

    deepStrictEqual(data, {
      createAuthor: {
        id: '3',
        name: { firstName: 'Tuco', lastName: 'Gustavo' }
      }
    })
  })

  await test('mutation with input array', async (t) => {
    const router = await startRouter(t, ['authors-subgraph'])
    const query = `
      mutation {
        batchCreateAuthor(authors: [
          { firstName: "Ernesto", lastName: "de la Cruz" },
          { firstName: "Hector", lastName: "Rivera" },
        ]) {
          id name { firstName lastName }
        }
      }
    `
    const data = await graphqlRequest(router, query)

    deepStrictEqual(data, {
      batchCreateAuthor: [{
        id: '3',
        name: { firstName: 'Ernesto', lastName: 'de la Cruz' }
      },
      {
        id: '4',
        name: { firstName: 'Hector', lastName: 'Rivera' }
      }]
    })
  })
})

test('entities', async () => {
  await test('throws if args function does not return an array of objects', async (t) => {
    const overrides = {
      subgraphs: {
        'books-subgraph': {
          entities: {
            Book: {
              args (partialResults) {
                return 'nope'
              }
            }
          }
        }
      }
    }

    const router = await startRouter(t, ['books-subgraph', 'reviews-subgraph'], overrides)
    const query = `
    query {
      getReviewBook(id: 1) {
        id
        title
        genre
        reviews {
          id
          rating
          content
        }
      }
    }
  `

    await rejects(async () => {
      await graphqlRequest(router, query)
    }, (err) => {
      strictEqual(Array.isArray(err), true)
      strictEqual(err.length, 1)
      strictEqual(err[0].message, 'args function did not return an object. returned nope.')
      deepStrictEqual(err[0].path, ['getReviewBook'])
      return true
    })
  })

  await test('resolve foreign types by picking up transitional nested keys', async (t) => {
    const query = `{
      getReviewBookByIds(ids: [1,2,3]) {
        title
        author { name { lastName } }
        reviews { rating }
      }
    }`

    const expectedResponse = {
      getReviewBookByIds:
      [{
        title: 'A Book About Things That Never Happened',
        author: { name: { lastName: 'Pluck' } },
        reviews: [{ rating: 2 }]
      },
      {
        title: 'A Book About Things That Really Happened',
        author: { name: { lastName: 'Writer' } },
        reviews: [{ rating: 3 }]
      },
      {
        title: 'Uknown memories',
        author: { name: null },
        reviews: [{ rating: 3 }, { rating: 5 }, { rating: 1 }]
      }]
    }

    const extend = {
      'authors-subgraph': (data) => {
        return {
          schema: `
          input IdsIn {
            in: [ID]!
          }
          input WhereIdsIn {
            ids: IdsIn
          }
   
          extend type Query {
            authors (where: WhereIdsIn): [Author]
          }
          `,
          resolvers: {
            Query: {
              authors: (_, args) => Object.values(data.authors).filter(a => args.where.ids.in.includes(String(a.id)))
            }
          }
        }
      },
      'books-subgraph': (data) => {
        data.library[1].authorId = 1
        data.library[2].authorId = 2
        data.library[3] = {
          id: 3,
          title: 'Uknown memories',
          genre: 'NONFICTION',
          authorId: -1
        }

        return {
          schema: `
            type Author {
              id: ID
            }
            
            extend type Book {
              author: Author
            }
          `,
          resolvers: {
            Book: {
              author: (parent) => ({ id: parent.authorId || data.library[parent.id]?.authorId })
            }
          }
        }
      }
    }
    const overrides = {
      subgraphs: {
        'books-subgraph': {
          entities: {
            Book: {
              referenceListResolverName: 'getBooksByIds',
              keys: [{ field: 'id', type: 'Book' }, { field: 'author.id', type: 'Author' }],
              args: (partialResults) => ({ id: partialResults.map(r => r.id) })
            }
          }
        },
        'authors-subgraph': {
          entities: {
            Author: {
              referenceListResolverName: 'authors',
              keys: [{ field: 'id', type: 'Author' }],
              args: (partialResults) => ({ where: { ids: { in: partialResults.map(r => r.id) } } })
            }
          }
        }
      }
    }

    const router = await startRouter(t, ['authors-subgraph', 'books-subgraph', 'reviews-subgraph'], overrides, extend)

    const response = await graphqlRequest(router, query)

    deepStrictEqual(response, expectedResponse)
  })

  await test('should not involve type keys that are not in the selection', async (t) => {
    const query = `{
      getReviewBookByIds(ids: [1,2,3]) {
        title
        reviews { rating }
      }
    }`

    const expectedResponse = {
      getReviewBookByIds:
      [{
        title: 'A Book About Things That Never Happened',
        reviews: [{ rating: 2 }]
      },
      {
        title: 'A Book About Things That Really Happened',
        reviews: [{ rating: 3 }]
      },
      {
        title: 'Uknown memories',
        reviews: [{ rating: 3 }, { rating: 5 }, { rating: 1 }]
      }]
    }

    let calls = 0
    const extend = {
      'authors-subgraph': (data) => {
        return {
          schema: `
          input IdsIn {
            in: [ID]!
          }
          input WhereIdsIn {
            ids: IdsIn
          }
   
          extend type Query {
            authors (where: WhereIdsIn): [Author]
          }
          `,
          resolvers: {
            Query: {
              authors: (_, args) => {
                calls++
                return []
              }
            }
          }
        }
      },
      'books-subgraph': (data) => {
        data.library[1].authorId = 1
        data.library[2].authorId = 2
        data.library[3] = {
          id: 3,
          title: 'Uknown memories',
          genre: 'NONFICTION',
          authorId: -1
        }

        return {
          schema: `
            type Author {
              id: ID
            }
            
            extend type Book {
              author: Author
            }
          `,
          resolvers: {
            Book: {
              author: (parent) => {
                calls++
                return { id: null }
              }
            }
          }
        }
      }
    }
    const overrides = {
      subgraphs: {
        'books-subgraph': {
          entities: {
            Book: {
              referenceListResolverName: 'getBooksByIds',
              keys: [{ field: 'id', type: 'Book' }, { field: 'author.id', type: 'Author' }],
              args: (partialResults) => ({ id: partialResults.map(r => r.id) })
            }
          }
        },
        'authors-subgraph': {
          entities: {
            Author: {
              referenceListResolverName: 'authors',
              keys: [{ field: 'id', type: 'Author' }],
              args: () => {
                calls++
                return []
              }
            }
          }
        }
      }
    }

    const router = await startRouter(t, ['authors-subgraph', 'books-subgraph', 'reviews-subgraph'], overrides, extend)

    const response = await graphqlRequest(router, query)

    deepEqual(calls, 0)
    deepStrictEqual(response, expectedResponse)
  })

  // TODO when an entity is spread across multiple subgraphs
  // TODO on runtime error (args fn throws, resolver throws)
  // TODO should throw error (timeout?) resolving type entity
})
