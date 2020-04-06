import Vue from 'vue';

export default ({app}) => {
  Vue.mixin({
    methods: {
      isNull(value) {
        return value === null || value === undefined;
      },
      restaurantId() {
        return this.$route.params.restaurantId;
      },
      doc2data(dataType) {
        return (doc) => {
          const data = doc.data();
          data.id = doc.id;
          data._dataType = dataType;
          return data;
        };
      },
      array2obj(array) {
        return array.reduce((tmp, current) => {
          tmp[current.id] = current;
          return tmp;
        }, {});
      },
      num2time(num) {
        let ampm = "AM";
        if (num > 60 * 12) {
          ampm = "PM";
          num = num - 60 * 12;
        }
        return [
          String(Math.floor(num/60)).padStart(2, '0'),
          ":",
          String(num % 60).padStart(2, '0'),
          " ",
          ampm].join("");
      },
    }
  });
}
