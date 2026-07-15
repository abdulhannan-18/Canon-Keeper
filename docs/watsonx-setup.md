# Getting watsonx.ai credentials

You need two values for `.env`: `WATSONX_API_KEY` and `WATSONX_PROJECT_ID`.

## Steps

1. Go to https://www.ibm.com/watsonx and click "Try watsonx for free."
2. Create or log in with an IBMid.
3. Create a watsonx.ai project (Dallas or Frankfurt region if you want
   access to the Prompt Lab tool too).
4. In the project, go to **Manage > General** to find your **Project ID**.
5. Generate an API key: IBM Cloud console → **Manage > Access (IAM) >
   API keys > Create an IBM Cloud API key**.
6. Put both values into `.env`:
   ```
   WATSONX_API_KEY=...
   WATSONX_PROJECT_ID=...
   MODEL_PROVIDER=watsonx
   ```

## If signup asks for a credit card

IBM Cloud's watsonx-specific signup flow currently asks for a card during
account creation, for identity verification — you are not charged unless
you manually upgrade to a paid plan and consume billable services. If you
don't have a card available:

- **Use the general IBM Cloud free trial** (cloud.ibm.com) instead of the
  watsonx-branded signup page, then provision watsonx.ai as a service
  inside that account. The general trial explicitly does not require a
  card.
- **Get invited as a collaborator** on a teammate's, mentor's, or your
  school's existing IBM Cloud account — invited users don't need their
  own card.
- **Ask your SkillsBuild organizers.** Official hackathons frequently
  provide a no-card student signup link or shared team credentials —
  this is the most reliable fix and worth asking for immediately.
- **Keep building against the `mock` or `huggingface` provider in the
  meantime** (see main README) so you're never blocked on development —
  swap to `watsonx` the moment access comes through.
