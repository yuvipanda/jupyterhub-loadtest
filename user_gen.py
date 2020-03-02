import numpy as np


def simp_poisson_process(rate=1, size=None):
    sum_exp_draws = np.cumsum(np.random.exponential(scale=rate, size=size))
    # sum_exp_draws = [sum(exp_draws[:i]) for i, x in enumerate(exp_draws)]
    return sum_exp_draws


def poisson_plus(lam=1, plus=1, size=None):
    return np.random.poisson(lam=lam, size=size) + plus


def int_exponential(rate=1, size=None):
    exp_draws = np.random.exponential(scale=rate, size=size)
    return np.round(exp_draws)


def diffs_btw_exp(rate=1, size=None):
    sorted_draws = sorted(np.random.exponential(scale=rate, size=size))
    seq_diffs = [x-sorted_draws[i-1] for i, x in enumerate(sorted_draws)]
    seq_diffs[0] = sorted_draws[0]
    return np.array(seq_diffs)


def is_pos_inc_seq(seq):
    return (sorted(seq) == list(seq) and all([x >= 0 for x in seq]))


def is_any_int(x):
    return isinstance(x, (int, np.int64))


def is_pos_int(seq):
    return (all([(x > 0 and is_any_int(x)) for x in seq]))


class Simple_Job_Set(object):
    def __init__(self, num_jobs):
        self.num_jobs = num_jobs

    @property
    def users_per_job(self):
        return self._users_per_job

    @users_per_job.setter
    def users_per_job(self, users_per_job):
        if is_pos_int(users_per_job):
            self._users_per_job = users_per_job
        else:
            raise ValueError("All jobs must be assigned at least one user")

    @property
    def start_times(self):
        return self._start_times

    @start_times.setter
    def start_times(self, start_times):
        if is_pos_inc_seq(start_times):
            self._start_times = start_times
        else:
            raise ValueError("start times must be positive and increasing")

    def rand_num_user_gen(self, params=None, func=None):
        """
        generates an integer number of users
        params is a dict of parameters
        func is a function with a signature like numpy.random functions
        """
        if params is None:
            params = {"lam": 5,
                      "plus": 1
                      }
        if func is None:
            func = poisson_plus
        self.users_per_job = func(**params, size=self.num_jobs)

    def rand_start_times_gen(self, params=None, func=None):
        """
        params is a dict of parameters
        func is a function with a signature like numpy.random functions
        """
        if params is None:
            params = {"rate": 5}
        if func is None:
            func = simp_poisson_process
        self.start_times = func(**params, size=self.num_jobs)

    def make_job_set(self, job_type=None):
        if job_type is None:
            job_type = Simple_Job
        job_array = list(np.zeros(shape=self.num_jobs))
        for i, x in enumerate(job_array):
            job_array[i] = job_type(self.users_per_job[i])
        self.jobs = job_array
        return self.jobs


class Simple_Job(object):
    def __init__(self, num_users):
        self.num_users = num_users

    @property
    def wait_times(self):
        return self._wait_times

    @wait_times.setter
    def wait_times(self, wait_times):
        if all([x >= 0 for x in wait_times]):
            self._wait_times = wait_times
        else:
            raise ValueError("Wait times must be positive")

    @property
    def end_times(self):
        return self._end_times

    @end_times.setter
    def end_times(self, end_times):
        if all([x > 0 for x in end_times]):
            self._end_times = end_times
        else:
            raise ValueError("End times must be positive")

    def rand_wait_times_gen(self, params=None, func=None):
        if params is None:
            params = {"rate": 5}
        if func is None:
            func = diffs_btw_exp
        self.wait_times = func(**params, size=self.num_users)

    def rand_end_times_gen(self, params=None, func=None):
        if params is None:
            params = {"scale": 5}
        if func is None:
            func = np.random.exponential
        self.wait_times = func(**params, size=self.num_users)


class JHub_Job_Set(Simple_Job_Set):

    def rand_num_user_gen(self, mean=1):
        params = {"lam": mean,
                  "plus": 1
                  }
        func = poisson_plus
        super(JHub_Job_Set, self).rand_num_user_gen(params=params, func=func)

    def rand_start_times_gen(self, mean=5):
        params = {"rate": mean}
        func = simp_poisson_process
        super(JHub_Job_Set, self).rand_start_times_gen(params=params, func=func)

    def make_job_set(self):
        super(JHub_Job_Set, self).make_job_set(job_type=JHub_Job)


class JHub_Job(Simple_Job):

    def rand_wait_times_gen(self, mean=5):
        params = {"rate": mean}
        func = diffs_btw_exp
        super(JHub_Job, self).rand_wait_times_gen(params=params, func=func)

    def rand_end_times_gen(self, mean=5):
        params = {"scale": mean}
        func = np.random.exponential
        super(JHub_Job, self).rand_end_times_gen(params=params, func=func)


if __name__ == "__main__":
    a = JHub_Job_Set(20)
    a.rand_start_times_gen()
    a.rand_num_user_gen()
    a.make_job_set()
    for x in a.jobs:
        x.rand_wait_times_gen()
        print("nodejs stress.js {}".format(",".join(map(str, x.wait_times))))
