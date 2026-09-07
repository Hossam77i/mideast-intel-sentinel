import time
import threading
import logging
from datetime import datetime, timezone
from .collector import collect_all_news
from .notifier import dispatch_urgent_alerts
from .database import get_settings, update_settings

logger = logging.getLogger("sentinel.daemon")

class SentinelDaemon:
    def __init__(self):
        self._thread = None
        self._stop_event = threading.Event()
        self.is_running = False

    def start(self):
        if self.is_running:
            logger.info("Daemon already running.")
            return

        self._stop_event.clear()
        self.is_running = True
        update_settings({"daemon_status": "running"})
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("Sentinel Lifetime Background Daemon started.")

    def stop(self):
        if not self.is_running:
            return
        self._stop_event.set()
        self.is_running = False
        update_settings({"daemon_status": "stopped"})
        logger.info("Sentinel Daemon stopped.")

    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                logger.info("Daemon executing scheduled collection and alert dispatch...")
                # 1. Collect news
                res = collect_all_news()
                # 2. Dispatch urgent notifications
                alert_res = dispatch_urgent_alerts()
                logger.info(f"Cycle completed: {res.get('new_inserted', 0)} new articles, {alert_res.get('sent', 0)} alerts sent.")
                update_settings({
                    "last_daemon_cycle": datetime.now(timezone.utc).isoformat(),
                    "daemon_status": "running"
                })
            except Exception as e:
                logger.error(f"Error in daemon cycle: {e}")
                update_settings({"last_daemon_error": str(e)})

            # Read interval from settings
            settings = get_settings()
            interval_mins = int(settings.get("poll_interval_minutes", "10"))
            interval_secs = max(interval_mins * 60, 60)  # at least 1 minute

            # Sleep in short slices to respond quickly to stop event
            for _ in range(interval_secs):
                if self._stop_event.is_set():
                    break
                time.sleep(1)

daemon_instance = SentinelDaemon()
