
export enum ContractState  {
  Downloaded = 1,
  Active = 2
}

export interface Response<T> {
  ok: boolean;
  code: number;
  error?: string;
  result?: T;
}

export interface Contract {
 ["@type"]: "storage.daemon.contractInfo";
  address: string;
  state: ContractState;
  torrent: string;
  created_time: number;
  file_size: string;
  downloaded_size: string;
  rate: string;
  max_span: number
  client_balance: string
  contract_balance: string;
}


export interface ProviderInfoResponse {
  contracts: Contract[];
}
export interface TorrentResponse {
  torrents: Torrent[];
  hash: string;
}

export interface Torrent {
  ["@type"]: "storage.daemon.torrent";
  hash: string;
  flags: number;
  total_size: string;
  description: string;
  files_count: string;
  included_size: number;
  dir_name: string;
  root_dir: string;
  active_download: boolean;
  active_upload: boolean;
  completed: boolean;
  download_speed: number;
  upload_speed: number;
  fatal_error: string;
}
