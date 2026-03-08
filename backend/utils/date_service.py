import time

def ninety_days():
    current_epoch = int(time.time())
    ninety_days = current_epoch - (89 * 24 * 60 * 60)
    return ninety_days

def curr_time():
    return int(time.time())

def get_time_ago(last_sync):
    if last_sync is None:
        return "Never"
    
    current_epoch = int(time.time())
    time_diff = current_epoch - last_sync
    return time_diff