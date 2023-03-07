import util from "util";
import childProcess, {ExecException} from "child_process";
import { resolve } from "path";
import {tmpdir} from "os";
import crypto from "crypto";
import fs from "fs";
import {TorrentResponse, Response, ProviderInfoResponse} from "./types.js";

const fsPromise = fs.promises;
const exec = util.promisify(childProcess.exec);

export type CLIOptions = {
  bin: string;
  host: string;
  readonly privateKey: string;
  readonly publicKey: string;
  timeout: number;
}

type RunOptions = {
  timeout?: number;
}
export default class TonstorageCLI {
  private readonly bin: string;
  private readonly host: string;
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly timeout: number;
  constructor(options: CLIOptions) {
    this.bin = options.bin;
    this.host = options.host;
    this.privateKey = options.privateKey;
    this.publicKey = options.publicKey;
    this.timeout = options.timeout;
  }

  // main
  async run(cmd: string, options: RunOptions = {}) {
    try {
      const std = await exec(
        `${this.bin} -v 0 -I ${this.host} -k ${this.privateKey} -p ${this.publicKey} --cmd "${cmd}"`,
        {timeout: options.timeout ? options.timeout : this.timeout},
      );

      return {stdout: std.stdout, stderr: ''};
    } catch (e: ExecException | any) {
      const stderr = [];

      if (e.signal && e.signal === 'SIGTERM') {
        stderr.push('error: timeout');
      }

      e.stdout = e.stdout.split('\n');
      if (/invalid|error|unknown|failed/i.test(e.stdout[0])) {
        stderr.push(e.stdout[0]);
      }

      stderr.push(e.stderr);

      return {stdout: '', stderr: stderr.join('/n').replaceAll('/n', ' ').trim()};
    }
  }

  async response<T>(cmd: string): Promise<Response<T>> {
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    try {
      return {
        ok: true,
        result: JSON.parse(std.stdout) as T,
        code: 0
      };
    } catch (e: ExecException | any) {
      return {
        ok: false,
        error: `error: ${e.message}`,
        code: 400
      };
    }
  }

  // cli
  async list() {
    const cmd = 'list --json';

    return await this.response<TorrentResponse>(cmd);
  }

  async get(index: string) {
    const cmd = `get ${index} --json`;

    const res = await this.response(cmd);
    return res;
  }

  async getPeers(index: string) {
    const cmd = `get-peers ${index} --json`;

    const res = await this.response(cmd);
    return res;
  }

  async create(path: string, options = {upload: true, copy: false, description: null}) {
    const cmd = `create '${path}' --json ${!options.upload ? '--no-upload' : ''} `
      + `${options.copy ? '--copy' : ''} `
      + `${options.description ? `-d '${options.description}'` : ''}`;

    const res = await this.response(cmd);
    return res;
  }

  async addByHash(hash: string, options = {
    download: false, upload: true, rootDir: null, partialFiles: [],
  }) {
    const cmd = `add-by-hash --json ${hash} ${!options.upload ? '--no-upload ' : ''}`
      + `${!options.download ? '--paused ' : ''}`
      + `${options.rootDir ? `-d ${options.rootDir} ` : ''}`
      + `${options.partialFiles && options.partialFiles.length > 0 ? `--partial ${options.partialFiles.join(' ')}` : ''}`;

    const res = await this.response(cmd);
    return res;
  }

  async addByMeta(path: string, options = {
    download: false, upload: true, rootDir: null, partialFiles: [],
  }) {
    const cmd = `add-by-meta --json ${path} ${!options.upload ? '--no-upload ' : ''}`
      + `${!options.download ? '--paused ' : ''}`
      + `${options.rootDir ? `-d ${options.rootDir} ` : ''}`
      + `${options.partialFiles && options.partialFiles.length > 0 ? `--partial ${options.partialFiles.join(' ')}` : ''}`;

    const res = await this.response(cmd);
    return res;
  }

  async getMeta(index: string) {
    const SIZE_REGEXP = /saved\smeta\s\((?<size>[0-9]+\s\w+)\)/i;
    const SUCCESS_REGEXP = /saved\smeta/i;
    const tempFilePath = resolve(tmpdir(), crypto.randomBytes(6).readUIntLE(0, 6).toString(36));

    const cmd = `get-meta ${index} ${tempFilePath}`;
    const std = await this.run(cmd);

    let payload = '';
    try {
      payload = await fsPromise.readFile(tempFilePath, {encoding: 'base64'});
      await fsPromise.rm(tempFilePath);
    } catch (e: ExecException | any) {
      return {ok: false, error: `error: ${e.message}`, code: 400};
    }

    if (std.stderr) {
      const error = std.stderr.replaceAll('/n', '');
      return {ok: false, error, code: 400};
    }

    const sizeMatch = SIZE_REGEXP.exec(std.stdout);
    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        payload,
        message: 'success',
        size: (sizeMatch && sizeMatch.groups) ? sizeMatch.groups.size : null,
      },
      code: 0,
    };
  }

  async remove(index: string, options = {removeFiles: false}) {
    const SUCCESS_REGEXP = /success/i;

    const cmd = `remove ${index}${options.removeFiles ? ' --remove-files' : ''}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async downloadPause(index: string) {
    const SUCCESS_REGEXP = /success/i;

    const cmd = `download-pause ${index}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async downloadResume(index: string) {
    const SUCCESS_REGEXP = /success/i;

    const cmd = `download-resume ${index}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async uploadPause(index: string) {
    const SUCCESS_REGEXP = /success/i;

    const cmd = `upload-pause ${index}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async uploadResume(index: string) {
    const SUCCESS_REGEXP = /success/i;

    const cmd = `upload-resume ${index}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async priorityAll(index: string, priority: string) {
    const SUCCESS_REGEXP = /priority\swas\sset/i;

    const cmd = `priority-all ${index} ${priority}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async priorityName(index: string, name: string, priority: string) {
    const SUCCESS_REGEXP = /priority\swas\sset/i;

    const cmd = `priority-name ${index} '${name}' ${priority}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async priorityIdx(index: string, fileId: string, priority: string) {
    const SUCCESS_REGEXP = /priority\swas\sset/i;

    const cmd = `priority-idx ${index} ${fileId} ${priority}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  // provider
  async deployProvider() {
    const ADDRESS_REGEXP = /address:\s(?<address>[-1|0]:[A-F0-9]{64})/i;
    const NON_BOUNCEABLE_ADDRESS_REGEXP = /non-bounceable\saddress:\s(?<nonBounceableAddress>[A-Z0-9/+]{48})/i;

    const cmd = 'deploy-provider';
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const addressMatch = ADDRESS_REGEXP.exec(std.stdout);
    const nonBounceableAddressMatch = NON_BOUNCEABLE_ADDRESS_REGEXP.exec(std.stdout);

    return {
      ok: true,
      result: {
        address: (addressMatch && addressMatch.groups) ? addressMatch.groups.address : null,
        nonBounceableAddress: (nonBounceableAddressMatch && nonBounceableAddressMatch.groups) ? nonBounceableAddressMatch.groups.nonBounceableAddress : null,
      },
      code: 0,
    };
  }

  async getProviderInfo(options = {contracts: true, balances: true}) {
    const cmd = `get-provider-info --json ${options.contracts ? '--contracts' : ''} ${options.balances ? '--balances' : ''}`;

    return await this.response<ProviderInfoResponse>(cmd);
  }

  async setProviderConfig(maxContracts: string, maxTotalSize: string) {
    const SUCCESS_REGEXP = /storage\sprovider\sconfig\swas\supdated/i;

    const cmd = `set-provider-config --max-contracts ${maxContracts} --max-total-size ${maxTotalSize}`;
    const std = await this.run(cmd);
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async getProviderParams(providerAddress = null) {
    const cmd = `get-provider-params --json ${providerAddress ? `${providerAddress}` : ''}`;

    const res = await this.response(cmd);
    return res;
  }

  async setProviderParams(accept: string, rate: string, maxSpan: string, minFileSize: string, maxFileSize: string) {
    const SUCCESS_REGEXP = /storage\sprovider\sparameters\swere\supdated/i;

    const cmd = `set-provider-params --accept ${accept} --rate ${rate} --max-span ${maxSpan} --min-file-size ${minFileSize} --max-file-size ${maxFileSize}`;
    const std = await this.run(cmd, {timeout: 30000});
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async newContractMessage(torrent: string, queryId: string, providerAddress: string) {
    const RATE_REGEXP = /rate\s\(nanoton\sper\smb\*day\):\s(?<rate>[0-9]+)/i;
    const MAX_SPAN_REGEXP = /max\sspan:\s(?<maxSpan>[0-9]+)/i;

    const tempFilePath = resolve(tmpdir(), crypto.randomBytes(6).readUIntLE(0, 6).toString(36));

    const cmd = `new-contract-message ${torrent} ${tempFilePath} --query-id ${queryId} --provider ${providerAddress}`;
    const std = await this.run(cmd, {timeout: 30000});
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const rateMatch = RATE_REGEXP.exec(std.stdout);
    const maxSpanMatch = MAX_SPAN_REGEXP.exec(std.stdout);

    let payload = '';
    try {
      payload = await fsPromise.readFile(tempFilePath, {encoding: 'base64'});
      await fsPromise.rm(tempFilePath);
    } catch (e: ExecException | any) {
      return {ok: false, error: `error: ${e.message}`, code: 400};
    }

    return {
      ok: true,
      result: {
        payload,
        rate: (rateMatch && rateMatch.groups) ? parseInt(rateMatch.groups.rate, 10) : null,
        maxSpan: (maxSpanMatch && maxSpanMatch.groups) ? parseInt(maxSpanMatch.groups.maxSpan, 10) : null,
      },
      code: 0,
    };
  }

  async closeContract(address: string) {
    const SUCCESS_REGEXP = /closing\sstorage\scontract/i;

    const cmd = `close-contract ${address}`;
    const std = await this.run(cmd, {timeout: 30000});
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async withdraw(address: string) {
    const SUCCESS_REGEXP = /bounty\swas\swithdrawn/i;

    const cmd = `withdraw ${address}`;
    const std = await this.run(cmd, {timeout: 30000});
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async withdrawAll() {
    const SUCCESS_REGEXP = /bounty\swas\swithdrawn/i;

    const cmd = 'withdraw-all';
    const std = await this.run(cmd, {timeout: 30000});
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }

  async sendCoins(address: string, amount: string, options = {message: null}) {
    const SUCCESS_REGEXP = /internal\smessage\swas\ssent/i;

    const cmd = `send-coins ${address} ${amount}${options.message ? ` --message '${options.message}'` : ''}`;
    const std = await this.run(cmd, {timeout: 30000});
    if (std.stderr) {
      return {ok: false, error: std.stderr, code: 400};
    }

    const successMatch = SUCCESS_REGEXP.test(std.stdout);
    if (!successMatch) {
      return {ok: false, error: 'error: unknown error', code: 401};
    }

    return {
      ok: true,
      result: {
        message: 'success',
      },
      code: 0,
    };
  }
}

