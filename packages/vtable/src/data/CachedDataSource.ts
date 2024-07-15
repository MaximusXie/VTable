import { isArray, isValid } from '@visactor/vutils';
import {
  AggregationType,
  type FieldData,
  type FieldDef,
  type IListTableDataConfig,
  type IPagination,
  type MaybePromise,
  type MaybePromiseOrUndefined
} from '../ts-types';
import type { BaseTableAPI } from '../ts-types/base-table';
import type { ColumnData } from '../ts-types/list-table/layout-map/api';
import type { DataSourceParam } from './DataSource';
import { DataSource } from './DataSource';

/** @private */
function _setFieldCache(
  fCache: { [index: number]: Map<FieldDef, any> },
  index: number,
  field: FieldDef,

  value: any
): void {
  const recCache = fCache[index] || (fCache[index] = new Map());
  recCache.set(field, value);
}
/**
 * table data source for caching Promise data
 *
 * @classdesc VTable.data.CachedDataSource
 * @memberof VTable.data
 */
export class CachedDataSource extends DataSource {
  /**
   * record cache 当用户定义的CachedDataSource.get为promise的时候 可以用rCache缓存已获取数据条目
   */
  private _recordCache: any[];
  /**
   * field cache 当用户定义field为promise的时候 可以用fCache缓存已获取值
   */
  private _fieldCache: { [index: number]: Map<FieldDef, any> };
  static get EVENT_TYPE(): typeof DataSource.EVENT_TYPE {
    return DataSource.EVENT_TYPE;
  }
  static ofArray(
    array: any[],
    dataConfig?: IListTableDataConfig,
    pagination?: IPagination,
    columnObjs?: ColumnData[],
    rowHierarchyType?: 'grid' | 'tree',
    hierarchyExpandLevel?: number
  ): CachedDataSource {
    return new CachedDataSource(
      {
        get: (index: number): any => {
          // if (Array.isArray(index)) {
          //   return getValueFromDeepArray(array, index);
          // }
          return array[index];
        },
        length: array.length,
        records: array
      },
      dataConfig,
      pagination,
      columnObjs,
      rowHierarchyType,
      hierarchyExpandLevel
    );
  }

  groupAggregator: any;
  constructor(
    opt?: DataSourceParam,
    dataConfig?: IListTableDataConfig,
    pagination?: IPagination,
    columnObjs?: ColumnData[],
    rowHierarchyType?: 'grid' | 'tree',
    hierarchyExpandLevel?: number
  ) {
    if (isArray(dataConfig?.groupByRules)) {
      rowHierarchyType = 'tree';
    }
    super(opt, dataConfig, pagination, columnObjs, rowHierarchyType, hierarchyExpandLevel);
    this._recordCache = [];
    this._fieldCache = {};
  }
  protected getOriginalRecord(index: number): MaybePromiseOrUndefined {
    if (this._recordCache && this._recordCache[index]) {
      return this._recordCache[index];
    }
    return super.getOriginalRecord(index);
  }
  protected getOriginalField<F extends FieldDef>(
    index: number,
    field: F,
    col?: number,
    row?: number,
    table?: BaseTableAPI
  ): FieldData {
    const rowCache = this._fieldCache && this._fieldCache[index];
    if (rowCache) {
      const cache = rowCache.get(field);
      if (cache) {
        return cache;
      }
    }
    return super.getOriginalField(index, field, col, row, table);
  }

  clearCache(): void {
    if (this._recordCache) {
      this._recordCache = [];
    }
    if (this._fieldCache) {
      this._fieldCache = {};
    }
  }

  protected fieldPromiseCallBack<F extends FieldDef>(index: number, field: F, value: MaybePromiseOrUndefined): void {
    _setFieldCache(this._fieldCache, index, field, value);
  }
  protected recordPromiseCallBack(index: number, record: MaybePromiseOrUndefined): void {
    this._recordCache[index] = record;
  }
  get records(): any[] {
    return Array.isArray(this._recordCache) && this._recordCache.length > 0 ? this._recordCache : super.records;
  }

  release(): void {
    super.release?.();
    this._recordCache = null;
    this._fieldCache = null;
  }

  _generateFieldAggragations() {
    super._generateFieldAggragations();
    // groupby aggragations
    if (isArray(this.dataConfig?.groupByRules)) {
      // const groupByKey = this.dataConfig.groupByRules[0];
      const groupByKeys = this.dataConfig.groupByRules;
      this.groupAggregator = new this.registedAggregators[AggregationType.CUSTOM]({
        dimension: '',
        aggregationFun: (values: any, records: any, field: any) => {
          const groupMap = new Map();
          const groupResult = [] as any[];
          for (let i = 0; i < records.length; i++) {
            dealWithGroup(records[i], groupResult, groupMap, groupByKeys, 0);
            // const record = records[i];
            // const value = record[groupByKey];
            // if (value !== undefined) {
            //   if (groupMap.has(value)) {
            //     const index = groupMap.get(value);
            //     groupResult[index].children.push(record);
            //   } else {
            //     groupMap.set(value, groupResult.length);
            //     groupResult.push({
            //       vTableMerge: true,
            //       vtableMergeName: value,
            //       children: [] as any,
            //       map: new Map()
            //     });
            //   }
            // }
          }
          return groupResult;
        }
      });
      this.fieldAggregators.push(this.groupAggregator);
    }
  }

  processRecords(records: any[]) {
    const result = super.processRecords(records);
    const groupResult = this.groupAggregator?.value();
    if (groupResult) {
      return groupResult;
    }
    return result;
  }

  getGroupLength() {
    return this.dataConfig?.groupByRules?.length ?? 0;
  }
}

function dealWithGroup(record: any, children: any[], map: Map<number, any>, groupByKeys: string[], level: number) {
  const groupByKey = groupByKeys[level];
  if (!isValid(groupByKey)) {
    children.push(record);
    return;
  }
  const value = record[groupByKey];
  if (value !== undefined) {
    if (map.has(value)) {
      const index = map.get(value);
      // children[index].children.push(record);
      dealWithGroup(record, children[index].children, children[index].map, groupByKeys, level + 1);
    } else {
      map.set(value, children.length);
      children.push({
        vTableMerge: true,
        vtableMergeName: value,
        children: [] as any,
        map: new Map()
      });
      dealWithGroup(
        record,
        children[children.length - 1].children,
        children[children.length - 1].map,
        groupByKeys,
        level + 1
      );
    }
  }
}
