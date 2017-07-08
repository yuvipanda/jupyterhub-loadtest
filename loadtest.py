#!/usr/bin/python3
import requests
import time
import argparse
from concurrent.futures import ThreadPoolExecutor

class User:
    def __init__(self, hub_url, username, password):
        self.hub_url = hub_url
        self.username = username
        self.password = password
        self.session = requests.Session()

    def login(self):
        self.session.post(
            self.hub_url + '/hub/login',
            data={'username': self.username, 'password': self.password}
        )

    def start_server(self):
        # Using this and not the API since it seems there isn't an easy
        # way to find out if the server has fully started?
        next_url = self.hub_url + '/hub/spawn'
        for i in range(20):
            expected_url = self.hub_url + '/user/' + self.username + '/tree'
            next_url = self.session.get(next_url).url
            if next_url == expected_url:
                break
            time.sleep(10)
        else:
            return False
        return True

    def stop_server(self):
        url = '{}/hub/api/users/{}/server'.format(self.hub_url, self.username)
        # These hacks seem to be needed for talking to the API like this?
        host = self.hub_url.split('//', 1)[1] + '/hub'
        self.session.delete(url, headers={'referer': host}).raise_for_status()

def main():
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        'hub_url',
    )
    argparser.add_argument(
        'total_users',
        type=int
    )
    argparser.add_argument(
        'parallel_users',
        type=int
    )

    args = argparser.parse_args()

    def simulate_user(n):
        u = User(args.hub_url, n, 'wat')
        u.login()
        return u.start_server()

    executor = ThreadPoolExecutor(max_workers=args.parallel_users)
    futures = []
    for i in range(args.total_users):
        futures.append(executor.submit(simulate_user, 'user-{}-{}-{}'.format(args.total_users, args.parallel_users, i)))

    counts = {True: 0, False: 0}
    i = 0
    for f in futures:
        i += 1
        counts[f.result()] += 1
        if i % 50 == 0:
            print(i, counts)

if __name__ == '__main__':
    main()
