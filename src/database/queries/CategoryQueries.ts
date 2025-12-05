import { db } from '../db';
import { Category } from '../types';

const getCategoriesQuery = `
  SELECT * FROM categories ORDER BY CASE WHEN id > 1 THEN 1 ELSE 0 END, IFNULL(sort, 9999)
`;

export const getCategoriesFromDb = (): Category[] => {
  return db.getAllSync<Category>(getCategoriesQuery);
};

const createCategoryQuery = `
  INSERT INTO categories (name) VALUES (?)
`;

export const createCategory = (categoryName: string): void => {
  db.runSync(createCategoryQuery, [categoryName]);
};

const deleteCategoryQuery = `
  DELETE FROM categories WHERE id = ?
`;

export const deleteCategoryById = (categoryId: number): void => {
  db.runSync(deleteCategoryQuery, [categoryId]);
};

const updateCategoryQuery = `
  UPDATE categories SET name = ? WHERE id = ?
`;

export const updateCategory = (
  categoryId: number,
  categoryName: string,
): void => {
  db.runSync(updateCategoryQuery, [categoryName, categoryId]);
};

const isCategoryNameDuplicateQuery = `
  SELECT COUNT(*) as isDuplicate FROM categories WHERE name = ?
`;

export const isCategoryNameDuplicate = (categoryName: string): boolean => {
  const result = db.getFirstSync<{ isDuplicate: number }>(
    isCategoryNameDuplicateQuery,
    [categoryName],
  );
  return Boolean(result?.isDuplicate);
};

const updateCategoryOrderQuery = `
  UPDATE categories SET sort = ? WHERE id = ?
`;

export const updateCategoryOrderInDb = (categories: Category[]): void => {
  db.withTransactionSync(() => {
    categories.forEach(category => {
      db.runSync(updateCategoryOrderQuery, [category.sort, category.id]);
    });
  });
};
