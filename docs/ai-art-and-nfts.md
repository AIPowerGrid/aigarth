# AI art and NFT status

## AI art is live

`https://aipg.art` is the public gallery and creation experience. Developers can
generate through `POST https://api.aipowergrid.io/v1/images/generations` and
`POST /v1/videos/generations`. The available models change with worker capacity;
query `/v1/status/models` for the live list.

The art gallery's own Go backend is older than the canonical API and still has a
legacy poll-client migration to complete. New applications should use `/v1`, not
copy the gallery's legacy client.

## NFT status

Grid NFT minting is planned, not a live public API. There is no supported
`/v1/mint-nft` endpoint and no production GridNFT contract in the mainnet
deployment inventory.

The intended design is to make approved deterministic model/workflow runs
verifiable by committing model/workflow identifiers, parameters, seed, and
content metadata. Not every arbitrary or changing workflow can promise
bit-for-bit regeneration. Deterministic certification, content policy, contract
deployment, audit, storage policy, and mint UX must all land before this is
described as live.

Do not quote mint fees, launch dates, royalties, earnings, or supported NFT
marketplaces as facts until they are published by the current product.
