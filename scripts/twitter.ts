import { TwitterNotificationsSink } from '../src/twitter-notifications-sink';

async function main() {
  const twitterNotificationSink = new TwitterNotificationsSink();
  await twitterNotificationSink.push(
    {
      message: 'Test',
    },
    [],
  );
}

main().then((it) => console.log(it));
