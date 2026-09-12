import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Icon from '../components/Icon';
import ProductCard from '../components/ProductCard';
import { Loading, Alert, Empty, Pager } from '../components/ui';
import { useCart } from '../context/CartContext';
import { num } from '../utils/format';
import usePageMeta from '../hooks/usePageMeta';

const SORTS = [
  ['featured', 'Featured'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['newest', 'Newest'],
];

/** Step 2 of the reference flow: browse products by category or search. */
export default function Products() {
  usePageMeta({
    title: 'Software catalogue',
    description:
      'Browse genuine software licences - productivity, security, design, business and developer tools, delivered instantly after payment.',
    path: '/products',
  });

  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const [term, setTerm] = useState(params.get('q') || '');
  const { add } = useCart();

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'featured';
  const page = params.get('page') || '1';

  useEffect(() => {
    api.get('/shop/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    const query = new URLSearchParams({ q, category, sort, page });
    api
      .get(`/shop/products?${query}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [q, category, sort, page]);

  useEffect(() => {
    setTerm(q);
  }, [q]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, v);
    });
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const onAdd = (product) => {
    add({ productId: product.id }, 1);
    setAdded(`${product.name} was added to your cart.`);
    window.setTimeout(() => setAdded(''), 3000);
  };

  if (error) return <div className="container section"><Alert type="error">{error}</Alert></div>;

  return (
    <section className="section">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/">Home</Link> <span>/</span>
          <span>{data?.activeCategory ? data.activeCategory.name : 'Products'}</span>
        </div>

        {added && <Alert type="success" onClose={() => setAdded('')}>{added}</Alert>}

        <div className="shop-layout">
          {/* ---------- category sidebar ---------- */}
          <aside>
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="panel-head"><h3>Categories</h3></div>
              <div className="panel-body" style={{ padding: 10 }}>
                <div className="filter-side">
                  <button className={!category ? 'on' : ''} onClick={() => update({ category: '' })}>
                    <Icon name="grid" />
                    All Categories
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      className={category === c.slug ? 'on' : ''}
                      onClick={() => update({ category: c.slug })}
                    >
                      <Icon name={c.icon} />
                      {c.name}
                      <span className="n">{c.productCount}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Sort by</h3></div>
              <div className="panel-body" style={{ padding: 10 }}>
                <div className="filter-side">
                  {SORTS.map(([value, labelText]) => (
                    <button
                      key={value}
                      className={sort === value ? 'on' : ''}
                      onClick={() => update({ sort: value })}
                    >
                      {labelText}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* ---------- results ---------- */}
          <div>
            <div className="toolbar">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update({ q: term.trim() });
                }}
                style={{ display: 'flex', gap: 10, flex: 1 }}
              >
                <div className="search-box" style={{ flex: 1 }}>
                  <Icon name="search" />
                  <input
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search products"
                    style={{ width: '100%' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm">Search</button>
                {(q || category) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setParams(new URLSearchParams())}
                  >
                    Clear
                  </button>
                )}
              </form>
            </div>

            {!data ? (
              <Loading variant="grid" />
            ) : !data.products.length ? (
              <div className="panel">
                <div className="panel-body">
                  <Empty icon="box">No products match that search.</Empty>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                  {num(data.total)} product{data.total === 1 ? '' : 's'}
                  {data.activeCategory ? ` in ${data.activeCategory.name}` : ''}
                </p>

                <div className="product-grid" data-reveal="fade">
                  {data.products.map((p) => (
                    <ProductCard key={p.id} product={p} onAdd={onAdd} />
                  ))}
                </div>

                {data.pages > 1 && (
                  <div className="panel" style={{ marginTop: 18 }}>
                    <Pager
                      page={data.page}
                      pages={data.pages}
                      total={data.total}
                      perPage={data.perPage}
                      onPage={(p) => update({ page: p })}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
