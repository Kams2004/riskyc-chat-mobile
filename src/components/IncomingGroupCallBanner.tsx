import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useCall } from '../features/calls/CallContext';
import { useGroupCall } from '../features/calls/GroupCallContext';
import { getGroup } from '../features/groups/api';

/**
 * Bridges CallContext (owns the persistent /queue/calls STOMP subscription
 * that group-call invites ride on, same as 1:1 invites) and GroupCallContext
 * (owns the actual mediasoup join) — mounted once at the app root alongside
 * GroupCallOverlay, renders nothing itself, just an Alert prompt.
 */
export function IncomingGroupCallBanner() {
  const { pendingGroupInvite, dismissGroupInvite } = useCall();
  const { groupCallState, joinGroupCall } = useGroupCall();
  const { t } = useTranslation('calls');

  useEffect(() => {
    if (!pendingGroupInvite) return;
    // Already on a call (1:1 or another group) — don't interrupt with a
    // prompt for one you can't join right now anyway.
    if (groupCallState !== 'idle') {
      dismissGroupInvite();
      return;
    }

    const invite = pendingGroupInvite;
    let cancelled = false;

    getGroup(invite.groupId)
      .then((group) => {
        if (cancelled) return;
        const name = invite.callerName || t('incomingBanner.someone');
        const title =
          invite.callType === 'VIDEO'
            ? t('incomingBanner.startedVideoCall', { name })
            : t('incomingBanner.startedVoiceCall', { name });
        Alert.alert(title, group.name, [
          { text: t('incomingBanner.dismiss'), style: 'cancel', onPress: dismissGroupInvite },
          {
            text: t('incomingBanner.join'),
            onPress: () => {
              dismissGroupInvite();
              joinGroupCall(invite.groupId, group.name, invite.callType);
            },
          },
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        dismissGroupInvite();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGroupInvite]);

  return null;
}
