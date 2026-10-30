import { A, H3, LegalPage, List, Section } from "@/components/ui/LegalPage";

// The privacy policy of the web app, the iOS app and the backend. Keep it in sync with the code when the data that is
// stored, who receives it, how long it is kept or the AI model (OLLAMA_MODEL, section 5) changes, and with the privacy
// manifest of the iOS app (PrivacyInfo.xcprivacy).

const LAST_UPDATED = "October 24, 2026";
const CONTACT_EMAIL = "privacy@colinrueegg.com";
const SOURCE_CODE_URL = "https://github.com/xcolx/Gym-2.0";

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy & Legal Notice" lastUpdated={LAST_UPDATED}>

      <Section title="Summary">
        <List>
          <li>
            Gym 2.0 is a private project. The server, the database and the AI model run on hardware the developer
            operates in Switzerland. Your data is not sold, not used for advertising and not used to train AI models.
          </li>
          <li>
            The code of the apps and the server is open source (<A href={SOURCE_CODE_URL}>github.com/xcolx/Gym-2.0</A>),
            so you can check how they handle your data.
          </li>
          <li>
            There are no ads, no analytics, no tracking and no third-party SDKs in the apps. The only external services
            are Cloudflare, which forwards all traffic to the server, and CrowdSec, which receives the IP addresses of
            detected attacks. The emails for your account are sent by a mail server the developer operates.
          </li>
          <li>
            You can download all data stored about your account and delete your account at any time in Settings →
            Account.
          </li>
        </List>
      </Section>

      <Section title="1. Who is responsible">
        <p>
          This policy covers the Gym 2.0 iOS app, the web app at gym2.app and the server they use (api.gym2.app). The
          controller responsible for the processing of your data is:
        </p>
        <address className="mt-3 not-italic">
          Colin Rüegg
          <br />
          Switzerland
          <br />
          Email: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>
        </address>
        <p>
          For any question about your data or to exercise your rights, write to this email address. This policy follows
          the Swiss Federal Act on Data Protection (FADP).
        </p>
        <p>
          Because the code of Gym 2.0 is open source, others can run their own copies of it. This policy doesn&apos;t
          cover them: if you use a copy run by someone else, that person is responsible for your data, and their own
          privacy policy applies.
        </p>
      </Section>

      <Section title="2. Data we process">
        <H3>Account</H3>
        <List>
          <li>Your email address, username and password. The password is only stored as a hash (bcrypt).</li>
          <li>
            When you sign up, change your email or reset your password: a time-limited token for the link we email you,
            and the new email address until you confirm it.
          </li>
          <li>
            Your profile image, bodyweight, app color, weight and distance units and language, if you set them.
          </li>
          <li>
            Technical account data: when the account was created, the last login, the number of failed logins (to
            protect against password guessing), when the username, profile image, bodyweight or password were last
            changed and whether you use the iOS app, the web app or both.
          </li>
        </List>

        <H3>Workouts and exercises</H3>
        <p>
          Your workouts (name, date, duration, exercises and sets with repetitions, weights, times, intensities and
          distances), your workout schemes, and the exercises you create (name, description, images, muscles and
          equipment). Workouts and bodyweight can say something about your health, see section 3.
        </p>

        <H3>Friends, chats and moderation</H3>
        <List>
          <li>Your friends, friend requests you sent or received, and users you blocked.</li>
          <li>
            Your chats: the messages and photos you send, the groups you create or join, their names and images, and
            which messages you have read.
          </li>
          <li>
            When you report a user, a group or a message: what you reported, the reason you enter and when, together
            with a copy of the reported content at that time (the username and profile image, the group&apos;s name and
            image, or the message&apos;s text, photo and sender&apos;s username). The copy lets us review the report even if
            the content is changed or deleted afterwards. Reports and their copies are kept until they are handled, also
            when the reported account, group or message is deleted.
          </li>
          <li>
            Automatic check of images: your profile images, group images and chat photos are checked for nudity when
            you upload them, by a detection model (NudeNet) that runs on our own server, so the images aren&apos;t sent
            to anyone for it. Images it is sure about are rejected. If it finds nudity in an image, rejected or not, it
            creates a report like a user would, with a copy of the image, the group&apos;s name or the message&apos;s
            text, your username, the body parts it found and how sure it was. These reports are kept like the others
            above, also when you delete your account, and are part of your data takeout (section 10). Nothing is stored about images without findings. Exercise images
            aren&apos;t checked.
          </li>
        </List>

        <H3>Gym-AI conversations</H3>
        <p>
          The messages you write to the Gym-AI, its answers and the titles of the conversations. See section 5 for how
          they are processed.
        </p>

        <H3>Login sessions</H3>
        <p>
          For every login: a hash of the session token, whether it is the iOS or the web app, the IP address at the
          login, when the session was created and when it was last used.
        </p>

        <H3>Server and connection data</H3>
        <List>
          <li>
            Every request to the server passes through Cloudflare (see section 6) and is logged by the server with the
            IP address, the time, the requested address and the response status. These logs are used to keep the
            service running, to find errors and to defend against attacks.
          </li>
          <li>
            The IP address is used for a short time in memory to limit the number of requests (rate limiting), e.g.
            against password guessing.
          </li>
          <li>
            The server logs are analyzed by CrowdSec, a security software running on the server, which detects attacks
            such as password guessing or scanning for vulnerabilities and blocks the IP addresses they come from. See
            section 6 for what it shares.
          </li>
          <li>
            Anonymous statistics of the requests per hour (route, response status, response time, API version and
            platform), without IP addresses or any link to an account.
          </li>
        </List>
      </Section>

      <Section title="3. Why we process your data and legal bases">
        <List>
          <li>
            <b>To provide Gym 2.0</b> (account, sync between your devices, workouts and stats, friends, chats, Gym-AI,
            account emails): necessary to perform the contract with you, i.e. to provide the service you signed up for.
          </li>
          <li>
            <b>Health-related data</b> (workouts and bodyweight): only processed because you enter it, to show it to you
            and sync it. By entering it you explicitly consent to this. You can delete individual entries or
            your account at any time, which withdraws the consent for the future.
          </li>
          <li>
            <b>Security and operation</b> (server logs, rate limiting, attack detection with CrowdSec, failed login counter, sessions, backups,
            anonymous request statistics, handling of reports, the automatic check of uploaded images for nudity): our
            legitimate interest in a secure, working and abuse
            free service.
          </li>
          <li>
            <b>Legal obligations</b>, e.g. answering requests of authorities where the law requires it.
          </li>
        </List>
        <p>
          The only automated decision is the rejection of uploaded images in which the automatic check finds nudity (see
          section 2). It only affects the upload: the reports it creates are reviewed by a person, and decisions about
          your account, like a suspension, are always made by a person. If you think an image was rejected wrongly,
          contact us at <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>. We don&apos;t create profiles for
          advertising.
        </p>
      </Section>

      <Section title="4. Who can see your data">
        <List>
          <li>
            <b>Every user</b> who finds you by your exact username or meets you in a chat sees your username, profile
            image and app color.
          </li>
          <li>
            <b>Your friends</b> additionally see your language.
          </li>
          <li>
            <b>Members of a chat</b> see the messages and photos sent in it and who is a member. <b>Public groups</b>{" "}
            can be found and joined by every user, so everything sent in them is visible to all users.
          </li>
          <li>
            <b>Exercises</b> you create are only visible to you. If the developer verifies an exercise, it is reworked and its
            description and images are replaced before other users can see it, and it is shown without your name.
          </li>
          <li>
            <b>The developer</b> has access to the database to operate the service, answer your requests, fix errors,
            review exercises and handle reports and abuse. Data is only looked at where this is needed for these
            purposes.
          </li>
        </List>
        <p>Your workouts, workout schemes, bodyweight, email address and Gym-AI conversations are never shown to other users.</p>
      </Section>

      <Section title="5. Gym-AI">
        <p>
          The Gym-AI is Qwen3.5 4B, an open-weight language model by the Qwen team of Alibaba Cloud, which runs on a server
          the developer operates (with Ollama). Only the model itself comes from Alibaba, no data is sent there. Your messages are
          not sent to any AI provider or other third party. To answer, the model receives the current conversation (up
          to its last 50 messages) and nothing else: no workouts, stats or profile data. The conversations are stored so
          you can open them again, until you delete them or your account. They are not used to train or improve the
          model.
        </p>
        <p>
          The answers are generated automatically and can be wrong. They are no medical advice. Don&apos;t enter
          information about yourself or others that you don&apos;t want to have stored.
        </p>
      </Section>

      <Section title="6. Service providers and transfers abroad">
        <p>
          Everything is hosted on hardware the developer operates in Switzerland, including the mail server that sends
          the emails to verify your account, confirm a new email address and reset your password. The only other
          providers are:
        </p>
        <List>
          <li>
            <b>Cloudflare, Inc.</b> (USA) protects gym2.app and api.gym2.app and forwards all traffic to the server
            (reverse proxy). For this, Cloudflare processes your IP address, technical data of your device and browser,
            and the content of the requests, which it decrypts and encrypts again on the way. See the{" "}
            <A href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy policy</A>.
          </li>
          <li>
            <b>Apple</b> distributes the iOS app through the App Store. Downloads, purchases and the optional analytics
            and crash reports you can share with app developers in the iOS settings are handled by Apple under its own{" "}
            <A href="https://www.apple.com/legal/privacy/">privacy policy</A>. We don&apos;t receive any personal data
            from Apple that identifies you.
          </li>
          <li>
            <b>CrowdSec SAS</b> (France): when CrowdSec on the server detects an attack, it reports the IP address it
            came from, the time and the type of attack to CrowdSec&apos;s central service, which uses these reports to
            create a shared blocklist of known attackers. Normal use of Gym 2.0 is not reported. See the{" "}
            <A href="https://www.crowdsec.net/privacy-policy">CrowdSec privacy policy</A>.
          </li>
        </List>
        <p>
          Cloudflare may process data in the USA and other countries. These transfers are based on the Swiss-U.S. and
          EU-U.S. Data Privacy Framework, under which Cloudflare is certified, or on the standard contractual clauses of
          the European Commission recognized by Switzerland.
        </p>
        <p>
          The nightly backups (see section 8) are encrypted on the server before they are sent to a backup server the
          developer operates, so it only stores encrypted data. We don&apos;t sell or rent your data to anyone.
        </p>
      </Section>

      <Section title="7. Data stored on your device">
        <H3>Web app</H3>
        <List>
          <li>
            A cookie with your session (<code>session_token</code>). It is technically necessary for staying logged in,
            HTTP-only (not readable by scripts) and only sent to gym2.app. There are no tracking or advertising cookies,
            so there is no cookie banner.
          </li>
          <li>
            A copy of your data in the browser&apos;s database (IndexedDB) and cached images and app files (service
            worker), so the app works offline. The local storage keeps the logged-in user, the app color, the appearance
            and when the update notice was last shown.
          </li>
        </List>
        <H3>iOS app</H3>
        <List>
          <li>
            The session token in the iOS Keychain. Keychain items can remain on the device after the app is deleted, a
            reinstalled app removes it when it is first started.
          </li>
          <li>A copy of your data in the app&apos;s database, cached images and settings, so the app works offline.</li>
          <li>
            Photos are only accessed when you pick one (profile image, group image, chat photo, exercise image). Files
            you import or export stay on your device until you share them.
          </li>
        </List>
        <p>
          Logging out or deleting your account removes your data from the device. In the browser you can also remove it
          by deleting the site data of gym2.app.
        </p>
      </Section>

      <Section title="8. How long we keep data">
        <List>
          <li>
            <b>Account and its content</b>: as long as your account exists. Things you delete (workouts, schemes,
            exercises, chats, messages, Gym-AI conversations) are kept for 30 days, so the deletion reaches all your
            devices, and then removed permanently.
          </li>
          <li>
            <b>Deleted account</b>: you are logged out everywhere, your profile images are removed and the messages and
            photos you sent in chats are deleted immediately, as if you had deleted each of them yourself. Your direct
            chats are deleted and you leave your groups (a group without members is deleted). The account and
            all its data are removed permanently 30 days later. Exercises that were verified for all users stay available,
            without your name.
          </li>
          <li>
            <b>Unconfirmed sign ups</b>: removed after 3 days. Email links expire after 24 hours (verification) or 60
            minutes (password reset).
          </li>
          <li>
            <b>Sessions</b>: until you log out on that device, change your password (which ends all other sessions),
            delete your account or the session expires, after 30 days to 2 years depending on how often it is used.
            Expired sessions, with their IP address, are deleted within a day.
          </li>
          <li>
            <b>Server logs</b>: deleted automatically after 15 days at the latest.
          </li>
          <li>
            <b>CrowdSec</b>: blocks of an IP address usually last a few hours, the detected attacks are deleted from the
            server after a short time (7 days by default).
          </li>
          <li>
            <b>Anonymous request statistics</b>: 90 days.
          </li>
          <li>
            <b>Backups</b>: an encrypted backup of the database and images is made every night and kept for up to about 6
            months. Deleted data stays in older backups until they are removed; backups are only used to restore the
            service after a failure.
          </li>
        </List>
      </Section>

      <Section title="9. Security">
        <p>
          All connections are encrypted (HTTPS). Passwords are stored as bcrypt hashes and session tokens only as
          hashes. Uploaded images are re-encoded on the server, which removes metadata such as the location where a
          photo was taken. Backups are encrypted, and the server can only add new backups, not change or delete existing
          ones. No system is perfectly secure, but we take reasonable measures to protect your data.
        </p>
      </Section>

      <Section title="10. Your rights">
        <p>Depending on the applicable law, you have the right to:</p>
        <List>
          <li>
            <b>Access</b> your data and receive it in a portable format: Settings → Account → Data Takeout downloads a
            ZIP file with all data stored about your account in a JSON file, including the reports the automatic check
            of images created of your uploads, and the images themselves. Reports that other users sent about you are
            not included, to protect the people who reported.
          </li>
          <li>
            <b>Correct</b> your data: your profile, workouts, schemes and exercises can be edited in the app.
          </li>
          <li>
            <b>Delete</b> your data: Settings → Account → Delete Account, or individual entries in the app.
          </li>
          <li>
            <b>Object</b> to processing based on our legitimate interest, ask for it to be <b>restricted</b>, and{" "}
            <b>withdraw your consent</b> at any time with effect for the future.
          </li>
        </List>
        <p>
          For anything you can&apos;t do in the app, email <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> from
          the email address of your account. We answer within 30 days.
        </p>
      </Section>

      <Section title="11. Children">
        <p>
          Gym 2.0 is not intended for children under 16. If you are under 16, don&apos;t create an account. If we learn
          that a child under 16 has an account, we delete it.
        </p>
      </Section>

      <Section title="12. Changes to this policy">
        <p>
          We update this policy when Gym 2.0 changes the way it processes data. The current version is always available
          at <A href="https://gym2.app/privacy">gym2.app/privacy</A>, with the date of the last update at the top. If a
          change matters for you, we tell you in the app or by email.
        </p>
      </Section>
    </LegalPage>
  );
}
