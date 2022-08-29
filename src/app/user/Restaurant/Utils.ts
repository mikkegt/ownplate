import {
  ref,
  onUnmounted,
  computed,
  Ref,
  ComputedRef,
} from "@vue/composition-api";

import { db } from "@/lib/firebase/firebase9";
import {
  query,
  onSnapshot,
  getDocs,
  collection,
  collectionGroup,
  where,
  limit,
  startAfter,
  orderBy,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";

import { doc2data, array2obj } from "@/utils/utils";

export const useTitles = (restaurantId: Ref) => {
  const titles = ref<DocumentData[]>([]);

  const titleDetacher = ref();
  const detacheTitle = () => {
    if (titleDetacher.value) {
      titleDetacher.value();
    }
  };
  onUnmounted(() => {
    detacheTitle();
  });

  const loadTitle = () => {
    detacheTitle();
    titleDetacher.value = onSnapshot(
      query(
        collection(db, `restaurants/${restaurantId.value}/titles`),
        where("deletedFlag", "==", false)
      ),
      (title) => {
        if (!title.empty) {
          titles.value = title.docs.map(doc2data("title"));
        }
      }
    );
  };
  const titleLists = computed(() => {
    return titles.value.filter((title) => title.name !== "");
  });

  return {
    loadTitle,
    titles,
    titleLists,
  };
};

export const useCategory = (moPrefix: string) => {
  const categoryDetacher = ref();
  const detacheCategory = () => {
    if (categoryDetacher.value) {
      categoryDetacher.value();
    }
  };
  onUnmounted(() => {
    detacheCategory();
  });

  const categoryData = ref<DocumentData[]>([]);
  const loadCategory = () => {
    detacheCategory();
    categoryDetacher.value = onSnapshot(
      query(
        collection(db, `groups/${moPrefix}/category`),
        where("publicFlag", "==", true),
        orderBy("sortKey", "asc")
      ),
      (category) => {
        if (category.empty) {
          console.log("Empty");
          return;
        }
        // categoryData.value = category.docs.map(doc2data("category"))
        categoryData.value = category.docs
          .map((doc) => {
            return [doc2data("category")(doc)];
          })
          .flat();
      },
      (error) => {
        console.log("load category error");
      }
    );
  };
  const categoryDataObj = computed(() => {
    return categoryData.value.reduce((tmp, current) => {
      tmp[current.id] = current;
      return tmp;
    }, {});
  });
  return {
    loadCategory,
    categoryData,
    categoryDataObj,
  };
};

export const useSubcategory = (moPrefix: string, category: Ref<string>) => {
  const subCategoryDetacher = ref();
  const detacheSubCategory = () => {
    if (subCategoryDetacher.value) {
      subCategoryDetacher.value();
    }
  };

  onUnmounted(() => {
    detacheSubCategory();
  });
  const subCategoryData = ref<DocumentData[]>([]);
  const loadSubcategory = () => {
    detacheSubCategory();
    subCategoryDetacher.value = onSnapshot(
      query(
        collection(
          db,
          `groups/${moPrefix}/category/${category.value}/subCategory`
        ),
        where("publicFlag", "==", true),
        orderBy("sortKey", "asc")
      ),
      (category) => {
        if (category.empty) {
          console.log("empty");
          return;
        }
        subCategoryData.value = category.docs.map(doc2data("subCategory"));
      },
      (error) => {
        console.log("load subCategory error");
      }
    );
  };
  return {
    subCategoryData,
    loadSubcategory,
  };
};

export const useAllSubcategory = (moPrefix: string) => {
  const subCategoryDetacher = ref();
  const detacheSubCategory = () => {
    if (subCategoryDetacher.value) {
      subCategoryDetacher.value();
    }
  };

  onUnmounted(() => {
    detacheSubCategory();
  });
  const allSubCategoryData = ref<DocumentData[]>([]);
  const loadAllSubcategory = () => {
    detacheSubCategory();
    subCategoryDetacher.value = onSnapshot(
      query(
        collectionGroup(db, `subCategory`),
        where("groupId", "==", moPrefix),
        orderBy("sortKey", "asc")
      ),
      (category) => {
        if (category.empty) {
          console.log("empty");
          return;
        }
        allSubCategoryData.value = category.docs.map(doc2data("subCategory"));
      },
      (error) => {
        console.log("load subCategory error");
      }
    );
  };
  const allSubCategoryDataObj = computed(() => {
    return allSubCategoryData.value.reduce((tmp, current) => {
      tmp[current.id] = current;
      return tmp;
    }, {});
  });
  return {
    allSubCategoryData,
    allSubCategoryDataObj,
    loadAllSubcategory,
  };
};

export const useMenu = (
  restaurantId: Ref<string>,
  isInMo: ComputedRef<string>,
  category: Ref<string>,
  subCategory: Ref<string>,
  groupData: any
) => {
  const allMenuObj = ref<{ [key: string]: DocumentData[] }>({});
  const menuCache = ref<{ [key: string]: any }>({});
  const menuDetacher = ref();
  const loading: { [key: string]: boolean } = {};

  const allMenuObjKey = computed(() => {
    if (isInMo.value) {
      return [category.value, subCategory.value].join("_")
    }
    return "mono";
  });
  const menus = computed(() => {
    return allMenuObj.value[allMenuObjKey.value] || [];
  });

  const detacheMenu = () => {
    if (menuDetacher.value) {
      menuDetacher.value();
    }
  };
  const menuPath = computed(() => {
    if (isInMo.value && groupData?.restaurantId) {
      return `restaurants/${groupData.restaurantId}/menus`;
    }
    return `restaurants/${restaurantId.value}/menus`;
  });
  const setCache = (cache: any) => {
    allMenuObj.value = cache;
    menuCache.value = cache;
  };
  const loadMenu = async () => {
    detacheMenu();
    if (isInMo.value && !category.value && !subCategory.value) {
      return;
    }
    const hasSubCategory = category.value && subCategory.value;
    if (menuCache.value[allMenuObjKey.value]) {
      allMenuObj.value[allMenuObjKey.value] = menuCache.value[allMenuObjKey.value];
      return;
    }

    if (hasSubCategory) {
      allMenuObj.value[allMenuObjKey.value] = [];
      const cacheBase: DocumentData[] = [];

      if (loading[allMenuObjKey.value]) {
        return;
      }
      loading[allMenuObjKey.value] = true;

      const limitVal = 20;
      const loop = async (
        category: string,
        subCategory: string,
        last: null | QueryDocumentSnapshot<DocumentData>
      ) => {
        // console.log("loop: ", subCategory);
        const tmpQuery = query(
          collection(db, menuPath.value),
          where("deletedFlag", "==", false),
          where("publicFlag", "==", true),
          where("category", "==", category),
          where("subCategory", "==", subCategory),
          orderBy("createdAt"),
          limit(limitVal)
        );
        const menuQuery = last ? query(tmpQuery, startAfter(last)) : tmpQuery;

        const menu = await getDocs(query(menuQuery));
        if (!menu.empty) {
          menu.docs
            .filter((a) => {
              const data = a.data();
              return data.validatedFlag === undefined || data.validatedFlag;
            })
            .map((a) => {
              const m = doc2data("menu")(a);
              cacheBase.push(m);
              return m;
            });
          const newVal = { ...allMenuObj.value };
          newVal[allMenuObjKey.value] = cacheBase;
          allMenuObj.value = newVal;
          menuCache.value[allMenuObjKey.value] = cacheBase;
        }
        return menu.docs.length == limitVal ? menu.docs[limitVal - 1] : null;
      };

      const doLoop = async (category: string, subCategory: string) => {
        let last: null | QueryDocumentSnapshot<DocumentData> = null;
        do {
          last = await loop(category, subCategory, last);
        } while (last);
      };
      doLoop(category.value, subCategory.value);
    } else {
      const menuQuery = query(
        collection(db, menuPath.value),
        where("deletedFlag", "==", false),
        where("publicFlag", "==", true)
      );

      menuDetacher.value = onSnapshot(query(menuQuery), (menu) => {
        if (!menu.empty) {
          const ret = menu.docs
            .filter((a) => {
              const data = a.data();
              return data.validatedFlag === undefined || data.validatedFlag;
            })
            .map(doc2data("menu"));
          allMenuObj.value = { [allMenuObjKey.value]: ret };
        } else {
          allMenuObj.value[allMenuObjKey.value] = [];
        }
      });
    }
  };

  const menuObj = computed(() => {
    if (isInMo.value) {
      return array2obj(Object.values(menuCache.value).flat());
    }
    return array2obj(menus.value);
  });

  return {
    loadMenu,
    setCache,
    menus,
    menuObj,
    menuCache,
  };
};

export const useCategoryParams = (ctx: any, isInMo: string) => {
  const category = computed(() => {
    return ctx.root.$route.params.category;
  });
  const subCategory = computed(() => {
    return ctx.root.$route.params.subCategory;
  });
  const watchCat = computed(() => {
    return [category.value, subCategory.value];
  });
  const hasCategory = computed(() => {
    return category.value && subCategory.value;
  });
  const showCategory = computed(() => {
    return isInMo && !subCategory.value;
  });
  const showSubCategory = computed(() => {
    return isInMo && subCategory.value;
  });

  return {
    category,
    subCategory,
    watchCat,
    hasCategory,
    showCategory,
    showSubCategory,
  };
};
