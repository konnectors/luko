const { BaseKonnector, requestFactory, log } = require('cozy-konnector-libs')

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

  log('info', 'Parsing list of documents')

  const documents = await parseBills()
  log('info', documents)
  log('info', 'Saving data to Cozy')

  await this.saveFiles(documents.downloadFiles, fields, {
    linkBankOperations: false,
    identifiers: ['Luko'],
    sourceAccount: this.accountId,
    sourceAccountIdentifier: fields.login,
    contentType: 'application/pdf',
    fileAttributes: {
      contentAuthor: 'fr-luko.eu'
    }
  })
  // await this.saveBills(documents, fields, {
  //   linkBankOperations: false,
  //   identifiers: ['Luko'],

  // })
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
  // authResp = authResp.request.body
  // log('info', JSON.parse(authResp))
  // log('info', authResp.request.response.body.data.login.user.connection)
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
    currency: 'EUR',
    filename: `${authResp.date}_${VENDOR}_${authResp.amount}EUR${
      authResp.vendorRef ? '_' + authResp.vendorRef : ''
    }.pdf`,
    vendor: VENDOR
  }))

  //  log('info',authResp)
  const downloadFiles = []
  for (let i = 0, l = authResp.length; i < l; i++) {
    const fileToDownload = {
      fileurl: authResp[i].downloadUrl,
      filename: authResp[i].filename
    }
    downloadFiles.push(fileToDownload)
  }
  return { authResp, downloadFiles }
}
