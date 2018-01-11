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


3. Tail the logs of the spawned pods to see results. Centralized log collection is *coming soon*.

## Cleaning up

You can delete the helm release easily with:

```bash
helm delete --purge <test-run-name>
```

Make sure to delete all the pods spawned by the hub before starting another test!
