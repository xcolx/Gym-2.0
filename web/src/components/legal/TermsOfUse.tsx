import { A, LegalPage, List, Section } from "@/components/ui/LegalPage";

// The terms of use of the web app, the iOS app and the backend, which users accept when they sign up. Section 4
// contains what the App Store requires of apps with user-generated content (no tolerance for objectionable content,
// reporting, blocking, reports handled within 24 hours), section 11 the minimum terms Apple requires of a custom
// license agreement and section 12 how these terms relate to the open source license of the code.

const LAST_UPDATED = "October 24, 2026";
const CONTACT_EMAIL = "tos@colinrueegg.com";
const SOURCE_CODE_URL = "https://github.com/xcolx/Gym-2.0";

export function TermsOfUse() {
  return (
    <LegalPage title="Terms of Use" lastUpdated={LAST_UPDATED}>
      <Section title="Summary">
        <List>
          <li>Gym 2.0 is a free, private project to track your workouts, chat with friends and ask the Gym-AI.</li>
          <li>
            There is <b>no tolerance for objectionable content or abusive users</b>. Report them in the app or by email.
            Reports are reviewed within 24 hours, the content is removed and the users who posted it are banned.
          </li>
          <li>Gym 2.0 and the Gym-AI give no medical advice. Train at your own risk.</li>
          <li>You can delete your account at any time in Settings → Account.</li>
          <li>
            The source code is open source under the GNU AGPL v3. These terms cover the service we run, not the code.
          </li>
        </List>
      </Section>

      <Section title="1. Agreement">
        <p>
          These terms apply to the Gym 2.0 iOS app, the web app at gym2.app and the server they use (api.gym2.app),
          together &quot;Gym 2.0&quot;, which is provided by Colin Rüegg, Switzerland (&quot;we&quot;). By creating an
          account or using Gym 2.0 you agree to these terms and to the{" "}
          <A href="https://gym2.app/privacy">Privacy Policy</A>, which explains how your data is processed. If you
          don&apos;t agree, don&apos;t use Gym 2.0.
        </p>
        <p>
          These terms only cover Gym 2.0 as run by us. Copies or modified versions of Gym 2.0 run by others (see section
          12) are not provided by us, and these terms and our Privacy Policy don&apos;t apply to them.
        </p>
      </Section>

      <Section title="2. Who can use Gym 2.0">
        <List>
          <li>You must be at least 16 years old.</li>
          <li>One person per account. Keep your password to yourself, you are responsible for what is done with your account.</li>
          <li>
            Your username is visible to other users. It must not impersonate others or be offensive, or we change or
            remove it.
          </li>
        </List>
      </Section>

      <Section title="3. Your content">
        <p>
          Your content is everything you add to Gym 2.0: workouts, workout schemes, exercises, images, chat messages and
          photos, group names and images, your profile and your Gym-AI conversations. It stays yours. You give us the
          permission to store, process and display it as far as needed to run Gym 2.0, e.g. to sync it to your devices
          and show your messages to the members of a chat. If we verify an exercise you created for all users, we
          rework it first, replace its description and images, and show it without your name. The permission ends when
          you delete the content or your account, as described in the Privacy Policy, except for verified exercises:
          they stay available to all users, still without your name.
        </p>
        <p>You may only add content you have the right to share, e.g. photos you took yourself.</p>
      </Section>

      <Section title="4. No objectionable content or abusive users">
        <p>
          Gym 2.0 has <b>zero tolerance</b> for objectionable content and abusive users. You must not post, send or
          upload content, or behave in a way, that:
        </p>
        <List>
          <li>harasses, threatens, bullies, stalks or intimidates others;</li>
          <li>is hateful or discriminates against people because of their origin, religion, gender, sexual orientation, disability or similar characteristics;</li>
          <li>is sexually explicit or pornographic, or sexualizes minors in any way;</li>
          <li>shows or glorifies violence, self-harm or cruelty to animals;</li>
          <li>promotes illegal activities, drugs or doping substances, or weapons;</li>
          <li>is spam, advertising, a scam or phishing;</li>
          <li>infringes the copyright, privacy or other rights of others, e.g. by sharing their personal data or photos without their consent;</li>
          <li>impersonates other people or is otherwise illegal.</li>
        </List>
        <p>
          <b>Blocking and reporting</b>: you can block any user, which stops them from sending you friend requests and
          direct messages. You can report users, groups and messages with a reason in the app: a message with a long
          press (or right click), a group or a member in the chat info, and a user also while blocking them (Block and
          Report). You can also report users and content by email to{" "}
          <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
        </p>
        <p>
          <b>What we do</b>: we review every report within 24 hours. Objectionable content is removed, and users who
          posted it are warned, suspended or permanently banned, depending on how serious it is. Illegal content may be
          reported to the authorities. We may also remove content and suspend accounts that break these terms without
          a report.
        </p>
        <p>
          <b>Automatic check of images</b>: profile images, group images and chat photos are checked automatically for
          nudity when you upload them. Images in which nudity is found with enough certainty are rejected, with a
          message telling you so. Images with possible nudity are reported to us automatically, whether they were
          rejected or not, and reviewed like the reports of users. The check can make mistakes: if an image of yours
          was rejected wrongly, contact us at <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>. Only a person
          decides about warnings, suspensions and bans, never the check alone.
        </p>
      </Section>

      <Section title="5. Using Gym 2.0 fairly">
        <p>Don&apos;t:</p>
        <List>
          <li>access accounts or data of others, or try to get around blocks, bans or limits;</li>
          <li>attack, overload or scan the servers, or use automated scripts or bots to access Gym 2.0;</li>
          <li>copy the content of other users or collect data from Gym 2.0, e.g. to use it in another service.</li>
        </List>
      </Section>

      <Section title="6. Health and fitness">
        <p>
          Gym 2.0 is a training log and no medical device. Suggested workouts, stats and Gym-AI answers are general
          information and <b>no medical advice</b>. Talk to a doctor before you start a new training, especially if you
          have health problems, are pregnant or injured. Stop training if you feel pain, dizziness or shortness of
          breath. You train at your own risk.
        </p>
      </Section>

      <Section title="7. Gym-AI">
        <p>
          The Gym-AI answers automatically with a language model and can be wrong, incomplete or inappropriate. Check
          important information yourself and don&apos;t rely on it for decisions about your health. Don&apos;t use it
          to create content that section 4 forbids. Answers can take up to two minutes, and the Gym-AI may be
          unavailable at times.
        </p>
      </Section>

      <Section title="8. Availability and changes">
        <p>
          Gym 2.0 is provided for free, as it is and as available. We try to keep it running and your data safe, but we
          can&apos;t guarantee that it is always available, free of errors or that no data is lost. Old versions of the
          apps may stop working with the server and have to be updated. We may change or add features, and we may end
          Gym 2.0, in which case we tell you in advance so you can download your data.
        </p>
      </Section>

      <Section title="9. Ending your account">
        <p>
          You can delete your account at any time in Settings → Account → Delete Account. We may suspend or delete
          accounts that break these terms, in serious cases without notice, and accounts that are needed to protect
          other users or Gym 2.0.
        </p>
      </Section>

      <Section title="10. Liability">
        <p>
          As far as the law allows, we are not liable for damages from using Gym 2.0, its content, the Gym-AI or the
          content of other users, nor for lost data. This does not limit liability for intent or gross negligence, or
          where the law doesn&apos;t allow it to be limited.
        </p>
      </Section>

      <Section title="11. iOS app from the App Store">
        <p>For the iOS app, in addition:</p>
        <List>
          <li>
            These terms are an agreement between you and us, not Apple. We, not Apple, are solely responsible for the
            app and its content. Your use of the app must also follow the usage rules of the Apple Media Services Terms
            and Conditions.
          </li>
          <li>Apple has no obligation to provide maintenance or support for the app.</li>
          <li>
            If the app fails to conform to any applicable warranty, you may notify Apple, and Apple will refund the
            purchase price, if any. Apple has no other warranty obligation with respect to the app.
          </li>
          <li>
            We, not Apple, are responsible for addressing any claims by you or third parties relating to the app, such as
            product liability claims, claims that it fails to conform to legal requirements, consumer protection or
            privacy claims, and claims that it infringes the intellectual property rights of others.
          </li>
          <li>
            You confirm that you are not located in a country subject to a U.S. Government embargo or designated as
            &quot;terrorist supporting&quot;, and not listed on any U.S. Government list of prohibited or restricted
            parties.
          </li>
          <li>
            Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.
          </li>
        </List>
      </Section>

      <Section title="12. Source code">
        <p>
          The source code of Gym 2.0 is available at <A href={SOURCE_CODE_URL}>github.com/xcolx/Gym-2.0</A> under the
          GNU Affero General Public License version 3 with additional terms. Under this license you may copy, modify and
          run it yourself, including for a service of your own, as long as you follow the license: you must make the
          source code of your version available to its users, including those who use it over the internet, under the
          same license, and versions with a user interface must show the notice &quot;Based on Gym 2.0 by Colin Rüegg -
          www.colinrueegg.com&quot;. The name Gym 2.0 and its logo are not licensed, so a modified version must not be
          presented as the original. The exact terms are in the LICENSE and NOTICE files of the repository.
        </p>
        <p>
          The license covers the code, these terms cover your use of the service we run. If they differ, the license
          applies to the code. Running your own copy doesn&apos;t give you any rights to our servers or the data and
          content of our users.
        </p>
      </Section>

      <Section title="13. Changes to these terms">
        <p>
          We may update these terms when Gym 2.0 changes. The current version is always available at{" "}
          <A href="https://gym2.app/tos">gym2.app/tos</A>, with the date of the last update at the top. If a change
          matters for you, we tell you in the app or by email. If you keep using Gym 2.0 after that, you accept the new
          terms.
        </p>
      </Section>

      <Section title="14. Law and contact">
        <p>
          These terms are governed by Swiss law. Mandatory consumer protection laws of the country you live in stay
          applicable. Questions about these terms: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
        </p>
      </Section>
    </LegalPage>
  );
}
