module.exports = {
  apps : [{
    name   : "worker",
    script : "./dist/worker.js",
    log_date_format: "YYYY-MM-DD HH:mm Z",
    instances: 1,
    cron_restart: process.env.CRON_RESTART,
    error_file: "./logs/error.log",
    out_file: "./logs/out.log",
    merge_logs: true,
    log_type: "json",
    stop_exit_codes: [0],
    autorestart: false,
    exec_mode: 'cluster_mode',
  }]
}
