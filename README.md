# jupyterhub-loadtest
Load Testing helper scripts for JupyterHubs

## Usage

We use [helm](http://helm.sh/) to spawn the tests!

1. Make sure you have helm installed and configured.
2. Prepare a configuration file. We use YAML, and you can find all the possible options in
   `loadtest/values.yaml`. At a minimum, you require:

   ```yaml
   hub:
     url: <full-url-to-your-hub>
   ```
2. Install the chart:

   ```bash
   helm upgrade --install --wait --namespace=<test-run-name> <test-run-name> loadtest -f config.yaml
   ```

   Where `<test-run-name>` is just a unique name you can use to identify this particular run.
   Make sure you use a unique namespace and release name for each run!

3. You can look at the events being generated in many ways:

   a. Tailing the logs of the individual load test pods with `kubectl logs`. This is just the
      `stderr` and `stdout` of the process, which is mingled JSON events + logs.
   b. Tail the logs of the `collector`, which is aggregating just events. This is in the format
      of fluent-bit's [out_file](http://fluentbit.io/documentation/0.12/output/file.html). Some logging
      is also co-mingled here.
   c. Copy the aggregated logs out of the collector pod. You can do this with a `kubectl cp` command,
      like:

      ```bash
      kubectl --namespace=<test-run-name> cp  $(kubectl --namespace=<test-run-name> get pod -l component=collector -o name | sed 's:pods/::'):/srv/events.log events.log
      ```

      This should copy *just* the events into `events.log` in your current directory. They're in the same
      `out_file` format, from which JSON can be easily extracted. There should be no other logs co-mingled
      here, so this is the best method for further analysis.

## Cleaning up

You can delete the helm release easily with:

```bash
helm delete --purge <test-run-name>
```

Make sure to delete all the pods spawned by the hub before starting another test!
