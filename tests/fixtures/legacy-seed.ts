import { DataRepository } from '../../src/app/domain/repository';
import { Product, State, newId, now } from '../../src/app/domain/models';
import { BLENDED_ONE_DESCRIPTION } from '../../src/app/infrastructure/seed/catalog-updates';

export async function seedDatabase(repository: DataRepository): Promise<void> {
  await repository.transact((state) => {
    if (state.settings.length) return;
    const timestamp = now();
    const almendrosId = newId();
    const afterId = newId();
    state.brands.push(
      ...[
        { id: almendrosId, name: 'Almendros Coffee Co.', slug: 'almendros' },
        { id: afterId, name: 'AFTER Coffee', slug: 'after' },
      ].map((b) => ({ ...b, isActive: true, createdAt: timestamp, updatedAt: timestamp })),
    );
    const categoryNames = ['Café empacado', 'Coffee Pods', 'Bebidas', 'Mercadería', 'Otros'];
    state.categories.push(
      ...categoryNames.map((name, sortOrder) => ({ id: newId(), name, sortOrder, isActive: true })),
    );
    state.locations.push({
      id: newId(),
      name: 'Almacén General',
      type: 'general',
      isActive: true,
      createdAt: timestamp,
    });
    state.settings.push({
      id: newId(),
      businessName: 'Almendros Coffee Co.',
      currency: 'HNL',
      locale: 'es-HN',
      timeZone: 'America/Tegucigalpa',
      schemaVersion: 1,
      deviceInstallId: newId(),
      compactDisplay: false,
      backupReminderDays: 7,
    });
    const add = (
      name: string,
      code: string,
      variants: [string, number?, number?][],
      options: {
        brandId?: string;
        category?: number;
        type?: Product['productType'];
        description?: string;
        active?: boolean;
        tracked?: boolean;
      } = {},
    ): string => {
      const productId = newId();
      state.products.push({
        id: productId,
        brandId: options.brandId ?? almendrosId,
        categoryId: state.categories[options.category ?? 0]!.id,
        name,
        description: options.description ?? '',
        productType: options.type ?? 'packaged_coffee',
        ...(!options.type || options.type === 'packaged_coffee'
          ? { grindOptions: ['Molido'] }
          : {}),
        tags: [],
        isActive: options.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      variants.forEach(([label, price, regular], sortOrder) => {
        state.variants.push({
          id: newId(),
          productId,
          sku: `${code}-${sortOrder + 1}`,
          name: label,
          ...(price === undefined ? {} : { priceMinor: price * 100 }),
          ...(regular === undefined ? {} : { compareAtPriceMinor: regular * 100 }),
          trackInventory: options.tracked ?? true,
          isActive: options.active ?? true,
          sortOrder,
          lowStockThreshold: 3,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });
      return productId;
    };
    add(
      'Washed Blend',
      'AF-WB',
      [
        ['½ lb', 100],
        ['1 lb', 185],
        ['3 lb', 510],
        ['5 lb', 750],
      ],
      { brandId: afterId },
    );
    add(
      'Parainema Lavado',
      'AL-PL',
      [
        ['½ lb', 140],
        ['1 lb', 270],
      ],
      {
        description:
          '84 puntos. Fermentación anaeróbica de 100 horas. Floral, chocolate dulce, cítricos, caramelo y avellana.',
      },
    );
    add(
      'Parainema Natural Edición Especial',
      'AL-PN',
      [
        ['250 g', 245, 265],
        ['500 g', 480, 490],
      ],
      {
        description:
          '87 puntos. Fermentación anaeróbica de 120 horas. Frutas tropicales, banano, piña, dulzor de fruta madura y cuerpo jugoso. Arte especial y stickers coleccionables.',
      },
    );
    add('Catimor Honey + Natural 80/20', 'AL-CH', [
      ['½ lb', 134],
      ['1 lb', 268],
    ]);
    add('Catimor Natural Anaeróbico', 'AL-CN', [['½ lb', 165]]);
    const blendedId = add('Blended One', 'AL-BO', [['250 g', 245]], {
      description: BLENDED_ONE_DESCRIPTION,
    });
    state.variants.find((v) => v.productId === blendedId)!.sku = 'AL-BO-2';
    add(
      'Coffee Pods',
      'AL-POD',
      [['Individual premium', 35], ['Bolsa mediana'], ['Bolsa grande']],
      {
        category: 1,
        type: 'coffee_pod',
        description:
          'Paquetes como SKU independientes. Referencias: mediana L30/pod; grande L25/pod. Configurar unidades reales y precio total antes de vender.',
      },
    );
    add(
      'Stickers',
      'AL-ST',
      [
        ['Individual', 30],
        ['Pack de 3', 65],
        ['Pack de 5', 95],
        ['Pack de 8', 140],
      ],
      { category: 3, type: 'merchandise' },
    );
    add(
      'Licor de café',
      'AL-LC',
      [
        ['225 ml', 200],
        ['500 ml', 400],
        ['1100 ml', 763],
      ],
      { category: 4, type: 'other', active: false },
    );
    for (const [i, name] of ['Café filtrado', 'Iced coffee', 'Iced latte'].entries())
      add(name, `AL-BEV${i + 1}`, [['Vaso']], {
        category: 2,
        type: 'beverage',
        tracked: false,
        description: 'Sin receta ni consumo automático de café empacado. Configure el precio.',
      });
  });
}

export function generalLocation(state: State): string {
  return state.locations.find((l) => l.type === 'general')!.id;
}
