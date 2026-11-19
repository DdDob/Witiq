// DEVNET helper. Generates two disposable Solana keypairs: a merchant (receives payments) and a
// demo buyer (pays). Prints them; nothing is saved. Never reuse these on mainnet: on mainnet,
// set SOLANA_PAY_TO to your own wallet's public address instead.
import { generateKeyPairSync } from 'node:crypto';
import { base58 } from '@scure/base';

function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
  const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return { address: base58.encode(pub), secret: base58.encode(Buffer.concat([seed, pub])) };
}

const merchant = keypair();
const buyer = keypair();

console.log(`
Environment variables:

SOLANA_PAY_TO=${merchant.address}
DEMO_BUYER_PRIVATE_KEY=${buyer.secret}

Fund BOTH wallets with devnet USDC at https://faucet.circle.com (Solana, Devnet, USDC):
  merchant (receives): ${merchant.address}
  demo buyer (pays):   ${buyer.address}

Funding the merchant once also creates its USDC token account, which settlement needs.
Also set SOLANA_NETWORK=devnet.
Devnet only. Never put a real wallet key in these variables.

For MAINNET you do not need this script: set SOLANA_PAY_TO to the public address of a wallet you
control (e.g. your Phantom address) that has held USDC at least once. No private key goes on the server.
`);
