import assert from 'assert'
import {Block, BlockContext, Chain, ChainContext, Option, Result, StorageBase} from './support'
import * as v1050 from './v1050'

export class BalancesAccountStorage extends StorageBase {
    protected getPrefix() {
        return 'Balances'
    }

    protected getName() {
        return 'Account'
    }

    /**
     *  The balance of an account.
     * 
     *  NOTE: THIS MAY NEVER BE IN EXISTENCE AND YET HAVE A `total().is_zero()`. If the total
     *  is ever zero, then the entry *MUST* be removed.
     * 
     *  NOTE: This is only used in the case that this module is used to store balances.
     */
    get isV1050(): boolean {
        return this.getTypeHash() === '0b3b4bf0dd7388459eba461bc7c3226bf58608c941710a714e02f33ec0f91e78'
    }

    /**
     *  The balance of an account.
     * 
     *  NOTE: THIS MAY NEVER BE IN EXISTENCE AND YET HAVE A `total().is_zero()`. If the total
     *  is ever zero, then the entry *MUST* be removed.
     * 
     *  NOTE: This is only used in the case that this module is used to store balances.
     */
    get asV1050(): BalancesAccountStorageV1050 {
        assert(this.isV1050)
        return this as any
    }
}

/**
 *  The balance of an account.
 * 
 *  NOTE: THIS MAY NEVER BE IN EXISTENCE AND YET HAVE A `total().is_zero()`. If the total
 *  is ever zero, then the entry *MUST* be removed.
 * 
 *  NOTE: This is only used in the case that this module is used to store balances.
 */
export interface BalancesAccountStorageV1050 {
    get(key: Uint8Array): Promise<v1050.AccountData>
    getAll(): Promise<v1050.AccountData[]>
    getMany(keys: Uint8Array[]): Promise<v1050.AccountData[]>
}
