import { createTenant } from '../actions';

export default function NovoTenantPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <a href="/admin/tenants" className="text-xs text-gray-400 hover:text-gray-600">
            ← Voltar
          </a>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Novo Cliente</h1>
        </div>

        <form action={createTenant} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do studio
            </label>
            <input
              name="name"
              required
              placeholder="Ex: Studio Fit SP"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug (URL)
            </label>
            <input
              name="slug"
              required
              placeholder="Ex: studio-fit-sp"
              pattern="[a-z0-9-]+"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Apenas letras minúsculas, números e hífens.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
            <select
              name="plan"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          {searchParams.error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {decodeURIComponent(searchParams.error)}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Criar cliente
          </button>
        </form>
      </div>
    </main>
  );
}
