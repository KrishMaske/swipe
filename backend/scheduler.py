import logging
import asyncio
import os
import html
import traceback
from datetime import datetime, timezone

import pandas as pd

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config.settings import admin
from database.db import (
    get_access_url,
    get_all_non_fraudulent_transactions,
    get_latest_transaction_epoch,
    sync_accounts,
    sync_transactions,
    update_sync_time,
)
from models.fraud_detector import score_transaction, train_global_fraud_detector
from utils.email_service import send_html_email, wrap_html
from utils.date_service import ninety_days
from utils.simplefin_service import retrieve_accounts

logger = logging.getLogger(__name__)


def _build_scheduler() -> AsyncIOScheduler:
    return AsyncIOScheduler(
        timezone="UTC",
        job_defaults={
            "coalesce": True,
            "max_instances": 1,
        },
    )


scheduler = _build_scheduler()


def _format_exception_html() -> str:
    tb = html.escape(traceback.format_exc())
    return (
        "<p style='color:#b00020;font-weight:700;'>An exception was caught by the scheduler job.</p>"
        f"<pre style='background:#111;color:#f6f6f6;padding:12px;border-radius:8px;overflow:auto;'>{tb}</pre>"
    )


def _evaluation_report_html() -> tuple[str, int, int, int]:
    """Builds an HTML evaluation report using fraud_rows.csv and score_transaction."""
    csv_path = os.path.join(os.path.dirname(__file__), "models", "fraud_rows.csv")
    txns = pd.read_csv(csv_path)
    all_txn_dicts = txns.to_dict(orient="records")

    rows = []
    anomaly_count = 0
    normal_count = 0

    for txn in all_txn_dicts:
        user_id = str(txn.get("user_id", "unknown"))
        result = score_transaction(txn, user_id)

        merchant = html.escape(str(txn.get("merchant", "Unknown")))
        amount = abs(float(txn.get("amount", 0.0)))
        city = html.escape(str(txn.get("city", "Unknown")))
        state = html.escape(str(txn.get("state", "Unknown")))
        txn_date = html.escape(str(txn.get("txn_date", "Unknown Date")))

        is_anomaly = bool(result.get("is_anomaly", False))
        risk_score = float(result.get("risk_score", 0.0))

        if is_anomaly:
            status_text = f"[!] ANOMALY DETECTED (Risk: {risk_score})"
            status_color = "#b00020"
            anomaly_count += 1
        else:
            status_text = f"[OK] NORMAL (Risk: {risk_score})"
            status_color = "#0f7a39"
            normal_count += 1

        note_html = ""
        if "message" in result:
            note_html = f"<p style='margin:6px 0;color:#666;'>Note: {html.escape(str(result['message']))}</p>"

        features_html = ""
        if "features" in result and isinstance(result["features"], dict):
            feature_items = []
            for feature, value in result["features"].items():
                feature_items.append(
                    "<tr>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #eee;color:#333;'>{html.escape(str(feature))}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#333;'>{float(value):.3f}</td>"
                    "</tr>"
                )
            features_html = (
                "<table style='width:100%;border-collapse:collapse;margin-top:6px;'>"
                "<thead><tr><th style='text-align:left;padding:4px 8px;border-bottom:2px solid #ddd;'>Feature</th>"
                "<th style='text-align:right;padding:4px 8px;border-bottom:2px solid #ddd;'>Value</th></tr></thead>"
                f"<tbody>{''.join(feature_items)}</tbody></table>"
            )

        rows.append(
            "<div style='border:1px solid #ececec;border-radius:8px;padding:10px;margin:10px 0;'>"
            f"<div style='font-weight:700;color:#222;'>[{txn_date}] {merchant} | ${amount:.2f} | {city}, {state}</div>"
            f"<div style='margin-top:4px;font-weight:700;color:{status_color};'>{html.escape(status_text)}</div>"
            f"{note_html}"
            f"{features_html}"
            "</div>"
        )

    total = len(all_txn_dicts)
    summary = (
        "<div style='padding:10px;border-radius:8px;background:#f4f8ff;border:1px solid #d8e7ff;'>"
        f"<strong>Evaluation Summary:</strong> total={total}, "
        f"anomalies={anomaly_count}, normal={normal_count}"
        "</div>"
    )

    return summary + "".join(rows), total, anomaly_count, normal_count


async def sync_all_accounts_job() -> None:
    """Syncs accounts/transactions for every user with a linked SimpleFIN connection."""
    logger.info("[scheduler] Starting account sync job at %s", datetime.now(timezone.utc).isoformat())
    await send_html_email(
        "Swipe Scheduler: Account Sync Started",
        wrap_html(
            "Account Sync Job Started",
            "<p>sync_all_accounts_job has started.</p>",
        ),
    )

    total_users = 0
    users_synced = 0
    users_failed = 0
    total_accounts_synced = 0

    try:
        response = admin.table("simplefin_conn").select("user_id, id").execute()
        rows = response.data or []
    except Exception:
        logger.exception("[scheduler] Failed to load simplefin connections for scheduled sync")
        await send_html_email(
            "Swipe Scheduler: Account Sync Error",
            wrap_html("Account Sync Job Error", _format_exception_html()),
        )
        return

    total_users = len(rows)

    for row in rows:
        user_id = row.get("user_id")
        if not user_id:
            continue

        context = {"user_id": user_id, "supabase": admin}

        try:
            access_data = get_access_url(context)
            last_sync = access_data.get("last_sync")
            start_date = (last_sync - 259200) if last_sync else ninety_days()

            accounts = await retrieve_accounts(access_data["access_url"], start_date)
            all_acc_transactions = sync_accounts(context, access_data["id"], accounts)

            latest_txn_epoch = get_latest_transaction_epoch(all_acc_transactions)
            if latest_txn_epoch is not None:
                await sync_transactions(context, all_acc_transactions)
                update_sync_time(context, access_data["id"], latest_txn_epoch)

            users_synced += 1
            total_accounts_synced += len(all_acc_transactions or [])
        except Exception:
            users_failed += 1
            logger.exception("[scheduler] Scheduled sync failed for user_id=%s", user_id)
            await send_html_email(
                "Swipe Scheduler: Account Sync User Error",
                wrap_html(
                    "Account Sync User Error",
                    f"<p>Failed while syncing user_id: <strong>{html.escape(str(user_id))}</strong></p>"
                    + _format_exception_html(),
                ),
            )

    logger.info("[scheduler] Finished account sync job")
    await send_html_email(
        "Swipe Scheduler: Account Sync Success",
        wrap_html(
            "Account Sync Job Completed",
            "<p>sync_all_accounts_job finished successfully.</p>"
            f"<ul>"
            f"<li>Connections scanned: {total_users}</li>"
            f"<li>Users synced: {users_synced}</li>"
            f"<li>Users failed: {users_failed}</li>"
            f"<li>Accounts synced: {total_accounts_synced}</li>"
            f"</ul>",
        ),
    )


async def retrain_fraud_model_job() -> None:
    """Runs monthly global fraud model retraining using all non-confirmed-fraud transactions."""
    logger.info("[scheduler] Starting fraud retraining job at %s", datetime.now(timezone.utc).isoformat())
    await send_html_email(
        "Swipe Scheduler: Fraud Retraining Started",
        wrap_html(
            "Fraud Retraining Job Started",
            "<p>retrain_fraud_model_job has started.</p>",
        ),
    )

    try:
        all_txns = get_all_non_fraudulent_transactions()
        if len(all_txns) < 20:
            logger.warning("[scheduler] Skipping retraining, only %s rows found", len(all_txns))
            await send_html_email(
                "Swipe Scheduler: Fraud Retraining Skipped",
                wrap_html(
                    "Fraud Retraining Skipped",
                    f"<p>Only {len(all_txns)} transactions found. Minimum required: 20.</p>",
                ),
            )
            return

        # Offload CPU-bound training to a separate thread
        _, _, user_profiles = await asyncio.to_thread(train_global_fraud_detector, all_txns)
        report_html, total_eval, anomalies_eval, normal_eval = _evaluation_report_html()
        logger.info(
            "[scheduler] Fraud model retrained with %s transactions across %s users",
            len(all_txns),
            len(user_profiles),
        )
        await send_html_email(
            "Swipe Scheduler: Fraud Retraining Success",
            wrap_html(
                "Fraud Retraining Completed",
                f"<p>Model retraining finished successfully.</p>"
                f"<ul>"
                f"<li>Training transactions: {len(all_txns)}</li>"
                f"<li>User profiles: {len(user_profiles)}</li>"
                f"<li>Evaluation rows: {total_eval}</li>"
                f"<li>Evaluation anomalies: {anomalies_eval}</li>"
                f"<li>Evaluation normal: {normal_eval}</li>"
                f"</ul>"
                f"<h3 style='margin-top:14px;'>Evaluation Report</h3>"
                f"{report_html}",
            ),
        )
    except Exception:
        logger.exception("[scheduler] Fraud retraining job failed")
        await send_html_email(
            "Swipe Scheduler: Fraud Retraining Error",
            wrap_html("Fraud Retraining Job Error", _format_exception_html()),
        )


def start_scheduler() -> None:
    if scheduler.running:
        return

    # Every day at 3:00 AM.
    scheduler.add_job(
        sync_all_accounts_job,
        CronTrigger(hour="7", minute=0),
        id="account_sync_job",
        replace_existing=True,
    )

    # Every month on the 1st at 12:00 AM.
    scheduler.add_job(
        retrain_fraud_model_job,
        CronTrigger(day=1, hour=0, minute=0),
        id="fraud_retraining_job",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("[scheduler] Started with timezone=%s", scheduler.timezone)


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[scheduler] Stopped")
