/**
 * About page for Bluum.
 */

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-6">About Bluum</h1>

        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Bluum is a gratitude training app designed to help you build a daily
          reflection habit. Through thoughtful prompts and gentle coaching,
          Bluum helps you notice and appreciate the good in your life.
        </p>

        <div className="text-left space-y-4 text-gray-600 dark:text-gray-400">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            What Bluum is:
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>A daily gratitude reflection practice</li>
            <li>Curated prompts to spark meaningful reflection</li>
            <li>Gentle coaching to deepen your gratitude practice</li>
            <li>A calm, low-friction experience</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-6">
            What Bluum is not:
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Not a mood tracker</li>
            <li>Not therapy or clinical treatment</li>
            <li>Not toxic positivity</li>
          </ul>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          If you are experiencing thoughts of self-harm or suicide, please
          reach out to a crisis helpline. In the US, call or text 988.
        </p>
      </div>
    </main>
  );
}
