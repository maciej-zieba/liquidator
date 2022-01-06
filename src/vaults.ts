import { Connection, Account, clusterApiUrl, PublicKey } from '@solana/web3.js'
import { Provider, BN } from '@project-serum/anchor'
import { Network, DEV_NET, MAIN_NET } from '@synthetify/sdk/lib/network'
import { Exchange, ExchangeState } from '@synthetify/sdk/lib/exchange'
import { ACCURACY } from '@synthetify/sdk/lib/utils'
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { createAccountsOnAllCollaterals } from './utils'
import { cyan, yellow } from 'colors'
import { Prices } from './prices'
import { Synchronizer } from './synchronizer'
import { fetchVaultEntries, fetchVaults } from './fetchers'

const XUSD_BEFORE_WARNING = new BN(100).pow(new BN(ACCURACY))
const CHECK_ALL_INTERVAL = 60 * 60 * 1000
const CHECK_AT_RISK_INTERVAL = 5 * 60 * 1000
const NETWORK = Network.MAIN

const provider = Provider.local()
// @ts-expect-error
const wallet = provider.wallet.payer as Account
const connection = new Connection('https://ssc-dao.genesysgo.net', 'recent')
const { exchange: exchangeProgram, exchangeAuthority } = MAIN_NET

const main = async () => {
  console.log('Initialization')
  const exchange = await Exchange.build(
    connection,
    NETWORK,
    provider.wallet,
    exchangeAuthority,
    exchangeProgram
  )

  await exchange.getState()

  const state = new Synchronizer<ExchangeState>(
    connection,
    exchange.stateAddress,
    'State',
    await exchange.getState()
  )

  const prices = await Prices.build(
    connection,
    await exchange.getAssetsList(state.account.assetsList)
  )

  console.log('Assuring accounts on every collateral..')
  const collateralAccounts = await createAccountsOnAllCollaterals(
    wallet,
    connection,
    prices.assetsList
  )

  const xUSDAddress = prices.assetsList.synthetics[0].assetAddress
  const xUSDToken = new Token(connection, xUSDAddress, TOKEN_PROGRAM_ID, wallet)
  let xUSDAccount = await xUSDToken.getOrCreateAssociatedAccountInfo(wallet.publicKey)

  if (xUSDAccount.amount.lt(XUSD_BEFORE_WARNING))
    console.warn(yellow(`Account is low on xUSD (${xUSDAccount.amount.toString()})`))

  await loop()
}

const loop = async () => {
  const entries = await fetchVaultEntries(connection, exchangeProgram)
  const vaults = await fetchVaults(connection, exchangeProgram)

  console.log(vaults)
  for (const entry of entries) {
    console.log(entry)
  }
}

main()
