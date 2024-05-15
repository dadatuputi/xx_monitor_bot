import { Chain } from "../chain";
import { ClaimFrequency, CommissionChange, StakerNotify, XxWallet } from "../chain/types";
import { CmixID, CmixNode } from "../cmix/types"
import { BN } from "@polkadot/util";


export enum XXEvent {
    MONITOR_NAME_NEW = "MONITOR.NAME.NEW",
    MONITOR_STATUS_NEW = "MONITOR.STATUS.NEW",
    MONITOR_COMMISSION_NEW = "MONITOR.COMMISSION.NEW",
    CLAIM_EXECUTED = "CLAIM.EXECUTED",
    LOG_ADMIN = "LOG.ADMIN",
}

interface EventData {
    user_id: string,
}
interface UpdateEventData extends EventData {
    node_id: CmixID,
    node_name: string | null,
}

export interface NameEventData extends UpdateEventData {
    old_name: string | null,
    wallet_address?: string,
}

export interface StatusEventData extends UpdateEventData {
    new_status: string,
    old_status: string
}

export interface ClaimEventData extends EventData {
    chain: Chain,
    success: boolean,
    claim_wallet_bal: BN,
    frequency: ClaimFrequency,
    claim_total: BN,
    eras: number[],
    wallets: Map<XxWallet, StakerNotify[]>,
}

export interface CommissionEventData extends UpdateEventData {
    commission_data: CommissionChange
}