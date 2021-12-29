process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://ee6ac433dc6f4a9684c8b2a4d3b2b859@errors.cozycloud.cc/19'

const {
  BaseKonnector,
  requestFactory,
  log,
  utils
  // cozyClient
} = require('cozy-konnector-libs')

// const models = cozyClient.new.models
// const { Qualification } = models.document

const request = requestFactory({
  debug: false,
  cheerio: true,
  json: true,
  jar: true
})

const VENDOR = 'luko'
const baseUrl = 'https://fr.luko.eu'

module.exports = new BaseKonnector(start)

async function start(fields, cozyParameters) {
  log('info', 'Authenticating ...')
  if (cozyParameters) log('debug', 'Found COZY_PARAMETERS')
  await authenticate.bind(this)(fields.login, fields.password)

  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of bills')
  const bills = await parseBills()
  log('info', 'Parsing list of bills')

  log('info', 'Fetching the list of documents')
  const documents = await parseDocuments()
  log('info', documents)
  log('info', 'Saving bills data to Cozy')
  await this.saveBills(bills.downloadFiles, fields, {
    linkBankOperations: false,
    identifiers: ['Luko'],
    sourceAccount: this.accountId,
    sourceAccountIdentifier: fields.login,
    contentType: 'application/pdf'
  })
}

async function authenticate(username, password) {
  request(`${baseUrl}/`)

  await request({
    url: `https://cerbere.luko.eu/v1?lang=fr`,
    method: 'POST',
    json: {
      operationName: 'Login',
      variables: {
        credentials: {
          email: `${username}`,
          password: `${password}`
        }
      },
      query:
        'mutation Login($credentials: credentials!) {\n  login(cred: $credentials) {\nok\nuser {\nid\nemail\nfirstname\nlastname\nconnection {\njwtToken\nintercomTokens {\nweb\n}\n}\n }\n}\n}\n'
    },
    resolveWithFullResponse: true
  })
}

async function parseBills() {
  request(`${baseUrl}/my-account/invoices`)

  let billsDocs
  billsDocs = await request({
    url: `https://cerbere.luko.eu/v1?lang=fr`,
    method: 'POST',
    json: {
      operationName: 'GetPreviousInvoices',
      variables: {},
      query:
        'query GetPreviousInvoices{\nuser{\ninformationsInvoices{\ninvoices{\ndescription\ndate\namount\namountWithoutDiscount\nstatus\ndownloadUrl\nfailureReason\n}\n}\n}\n}\n'
    },
    resolveWithFullResponse: true
  })
  billsDocs =
    billsDocs.request.response.body.data.user.informationsInvoices.invoices

  billsDocs = billsDocs.map(billsDocs => ({
    ...billsDocs,
    date: new Date(),
    issueDate: billsDocs.date,
    currency: 'EUR',
    filename: `${utils.formatDate(billsDocs.date)}_${VENDOR}_${(
      billsDocs.amount / 100
    ).toFixed(2)}EUR.pdf`,
    vendor: VENDOR
  }))
  log('info', (billsDocs[1].amount / 100).toFixed(2))
  const downloadFiles = []
  for (let i = 0, l = billsDocs.length; i < l; i++) {
    const fileToDownload = {
      currency: billsDocs[i].currency,
      amount: `${(billsDocs[i].amount / 100).toFixed(2)}`,
      date: billsDocs[i].issueDate,
      fileurl: billsDocs[i].downloadUrl,
      filename: billsDocs[i].filename,
      vendor: VENDOR,
      fileAttributes: {
        metadata: {
          contentAuthor: 'fr-luko.eu',
          issueDate: utils.formatDate(billsDocs[i].issueDate),
          datetime: utils.formatDate(billsDocs[i].date),
          datetimeLabel: `issueDate`,
          isSubscription: true,
          carbonCopy: true
          // qualification: Qualification.getByLabel('house_insurance')
        }
      }
    }
    downloadFiles.push(fileToDownload)
  }
  return { downloadFiles }
}

async function parseDocuments() {
  request(`${baseUrl}/my-account/documents`)

  let docs
  docs = await request({
    url: `https://cerbere.luko.eu/v1?lang=fr`,
    method: 'POST',
    json: {
      operationName: 'GetContractDocuments',
      variables: {},
      query:
        'query GetContractDocuments{\ncontracts{\nid\nname\nproductCode\nstate\ndocuments{\nicon\ntitle\ndescription\nurl\ntrackingCode\n}\nusers {\nid\nfirstname\nlastname\ninsuranceRole\ninsuranceDocuments{\nicon\ntitle\ndescription\nurl\ntrackingCode\n}\n}\n}\n}\n'
    },
    resolveWithFullResponse: true
  })
  const contracts = docs.request.response.body.data.contracts

  const { documents: documents, users: users } = contracts[0]

  const docResult = []
  for (const doc of documents) {
    docResult.push(doc)
  }
  log('info', docResult)

  const userResult = []
  for (const user of users) {
    userResult.push(...user.insuranceDocuments)
  }
  log('info', userResult)
}
