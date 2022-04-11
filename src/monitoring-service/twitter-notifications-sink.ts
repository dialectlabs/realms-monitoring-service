import { TwitterApi } from 'twitter-api-v2';
import { Logger } from '@nestjs/common';
import { NotificationSink, ResourceId } from '@dialectlabs/monitor';

export interface TwitterNotification {
  message: string;
}

export class TwitterNotificationsSink
  implements NotificationSink<TwitterNotification>
{
  private readonly logger = new Logger(TwitterNotificationsSink.name);
  private twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_APP_KEY!,
    appSecret: process.env.TWITTER_APP_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  async push(
    notification: TwitterNotification,
    recipients: ResourceId[],
  ): Promise<void> {
    this.logger.log(notification.message);
    return this.twitterClient.v2
      .tweet({
        text: notification.message,
      })
      .then(() => {});
  }
}
