import { lookupArchive } from "@subsquid/archive-registry";
import * as ss58 from "@subsquid/ss58";
import {
  BatchContext,
  BatchProcessorItem,
  SubstrateBatchProcessor,
  decodeHex,
} from "@subsquid/substrate-processor";
import { Store, TypeormDatabase } from "@subsquid/typeorm-store";
import { In } from "typeorm";
import { Account, Transfer } from "./model";
import { BalancesTransferEvent } from "./types/events";
import { BalancesAccountStorage } from "./types/storage";
import { AccountData } from "./types/v1050";

const processor = new SubstrateBatchProcessor()
  .setDataSource({
    // Lookup archive by the network name in the Subsquid registry
    //archive: lookupArchive("kusama", {release: "FireSquid"})

    // Use archive created by archive/docker-compose.yml
    archive: lookupArchive("kusama", { release: "FireSquid" }),
    chain: "wss://kusama-rpc.polkadot.io"
  })
  .addEvent("Balances.Transfer", {
    data: {
      event: {
        args: true,
        extrinsic: {
          hash: true,
          fee: true,
        },
      },
    },
  } as const);

type Item = BatchProcessorItem<typeof processor>;
type Ctx = BatchContext<Store, Item>;

processor.run(new TypeormDatabase(), async (ctx) => {
  let transfersData = getTransfers(ctx);

  let accountIds = new Set<string>();
  for (let t of transfersData) {
    accountIds.add(t.from);
    accountIds.add(t.to);
  }

  let accounts = await ctx.store
    .findBy(Account, { id: In([...accountIds]) })
    .then((accounts) => {
      return new Map(accounts.map((a) => [a.id, a]));
    });

  let transfers: Transfer[] = [];

  const accountsData = await getAccountBalances(ctx, accountIds);
  for (let t of transfersData) {
    let { id, blockNumber, timestamp, extrinsicHash, amount, fee } = t;

    let from = getAccount(accounts, t.from);
    from.balance = accountsData?.get(from.id) || 0n
    let to = getAccount(accounts, t.to);
    to.balance = accountsData?.get(to.id) || 0n

    transfers.push(
      new Transfer({
        id,
        blockNumber,
        timestamp,
        extrinsicHash,
        from,
        to,
        amount,
        fee,
      })
    );
  }

  await ctx.store.save(Array.from(accounts.values()));
  await ctx.store.insert(transfers);
});

interface TransferEvent {
  id: string;
  blockNumber: number;
  timestamp: Date;
  extrinsicHash?: string;
  from: string;
  to: string;
  amount: bigint;
  fee?: bigint;
}

function getTransfers(ctx: Ctx): TransferEvent[] {
  let transfers: TransferEvent[] = [];
  for (let block of ctx.blocks) {
    for (let item of block.items) {
      if (item.name == "Balances.Transfer") {
        let e = new BalancesTransferEvent(ctx, item.event);
        let rec: { from: Uint8Array; to: Uint8Array; amount: bigint };
        if (e.isV1020) {
          let [from, to, amount] = e.asV1020;
          rec = { from, to, amount };
        } else if (e.isV1050) {
          let [from, to, amount] = e.asV1050;
          rec = { from, to, amount };
        } else if (e.isV9130) {
          rec = e.asV9130;
        } else {
          throw new Error("Unsupported spec");
        }

        transfers.push({
          id: item.event.id,
          blockNumber: block.header.height,
          timestamp: new Date(block.header.timestamp),
          extrinsicHash: item.event.extrinsic?.hash,
          from: ss58.codec("kusama").encode(rec.from),
          to: ss58.codec("kusama").encode(rec.to),
          amount: rec.amount,
          fee: item.event.extrinsic?.fee || 0n,
        });
      }
    }
  }
  return transfers;
}

function getAccount(m: Map<string, Account>, id: string): Account {
  let acc = m.get(id);
  if (acc == null) {
    acc = new Account();
    acc.id = id;
    m.set(id, acc);
  }
  return acc;
}

async function getAccountBalances(ctx: Ctx, ownersIds: Set<string>) {
  const storage = new BalancesAccountStorage(
    ctx,
    ctx.blocks[ctx.blocks.length - 1].header
  );
  const ownerAddresses = [...ownersIds];
  const ownerUintArrays = ownerAddresses.map(
    (x) => new Uint8Array(ss58.codec("kusama").decode(x))
  );
  let accountsData: AccountData[] = [];
  if (storage.isV1050) {
    accountsData = await storage.asV1050.getMany(ownerUintArrays);

    return new Map(ownerAddresses.map((v, i) => [v, accountsData[i].free]));
  }
  
}
