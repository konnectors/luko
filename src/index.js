process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://ee6ac433dc6f4a9684c8b2a4d3b2b859@errors.cozycloud.cc/19'

const {
  BaseKonnector,
  requestFactory,
  log,
  utils,
  cozyClient
} = require('cozy-konnector-libs')

const models = cozyClient.new.models
const { Qualification } = models.document

const request = requestFactory({
  debug: false,
  cheerio: true,
  json: true,
  jar: true
})

const VENDOR = 'Luko'
const baseUrl = 'https://fr.luko.eu'

module.exports = new BaseKonnector(start)

async function start(fields, cozyParameters) {
  log('info', 'Authenticating ...')
  if (cozyParameters) log('debug', 'Found COZY_PARAMETERS')

  await authenticate.bind(this)(fields.login, fields.password)

  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of documents')

  const documents = await parseBills()

  log('info', 'Parsing list of documents')

  log('info', 'Saving data to Cozy')

  await this.saveFiles(documents.downloadFiles, fields, {
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

  let authResp
  authResp = await request({
    url: `https://cerbere.luko.eu/v1?lang=fr`,
    method: 'POST',
    json: {
      operationName: 'GetPreviousInvoices',
      variables: {},
      query:
        'query GetPreviousInvoices {\nuser {\ninformationsInvoices {\ninvoices {\ndescription\ndate\namount\namountWithoutDiscount\nstatus\ndownloadUrl\nfailureReason\n}\n}\n}\n}\n'
    },
    resolveWithFullResponse: true
  })
  authResp =
    authResp.request.response.body.data.user.informationsInvoices.invoices

  authResp = authResp.map(authResp => ({
    ...authResp,
    date: new Date(),
    issueDate: authResp.date,
    currency: 'EUR',
    filename: `${utils.formatDate(authResp.date)}_${VENDOR}_${
      authResp.amount
    }EUR${authResp.vendorRef ? '_' + authResp.vendorRef : ''}.pdf`,
    vendor: VENDOR
  }))

  const downloadFiles = []
  for (let i = 0, l = authResp.length; i < l; i++) {
    const stringyfiedAmount = `${authResp[i].amount}`
    const fileToDownload = {
      currency: authResp[i].currency,
      amount: `${
        stringyfiedAmount.length > 2
          ? stringyfiedAmount.slice(0, 2) + '_' + stringyfiedAmount.slice(2, 4)
          : stringyfiedAmount
      }`,
      date: authResp[i].date,
      fileurl: authResp[i].downloadUrl,
      filename: authResp[i].filename,
      vendor: VENDOR,
      fileAttributes: {
        metadata: {
          contentAuthor: 'fr-luko.eu',
          issueDate: utils.formatDate(authResp[i].issueDate),
          datetime: utils.formatDate(authResp[i].date),
          datetimeLabel: `issueDate`,
          isSubscription: true,
          carbonCopy: true,
          qualification: Qualification.getByLabel('house_insurance')
        }
      }
    }
    downloadFiles.push(fileToDownload)
  }
  return { downloadFiles }
}
