import { MonitorRecord } from "../db/types"

export enum XXEvent {
    VALIDATOR_STATUS_CHANGE_DISCORD = "VALIDATOR_STATUS_CHANGE_DISCORD",
    VALIDATOR_STATUS_CHANGE_TELEGRAM = "VALIDATOR_STATUS_CHANGE_TELEGRAM",    
    VALIDATOR_NAME_CHANGE = "VALIDATOR_NAME_CHANGE",
    VALIDATOR_COMMISSION_CHANGE = "VALIDATOR_COMMISSION_CHANGE",
    CLAIM_EXECUTED = "CLAIM_EXECUTED",
    CLAIM_FAILED = "CLAIM_FAILED",
    LOG_ADMIN = "LOG_ADMIN"
}


export interface NotifyData {
    id: string,
    msg: string | string[]
}

export interface StatusData {
    status_new: string,
    data: MonitorRecord
}